import { App, CachedMetadata, Menu, Notice, setIcon, TFile } from "obsidian";
import type {
  DashboardData,
  DashboardColumn,
  DashboardCard,
  RenderCallbacks,
  TaskItem,
  DashboardSettings,
  CardSize,
  TrackerStyle,
} from "./types";
import { t, getLanguage } from "./i18n";
import { renderLibrarySection } from "./library-section";
import type { LibraryConfig } from "./types";
import { resolveVaultImage } from "./banner";
import { attachFileSuggest } from "./file-suggest";
import {
  fetchWeather,
  getCachedWeather,
  getWeatherEmoji,
  getWeatherDescription,
} from "./weather-service";
import { readTrackerData } from "./tracker-service";
import type { PomodoroService } from "./pomodoro-service";
import type { ReadingService } from "./reading-service";
import { searchBooks, downloadCoverAsBlobUrl } from "./book-service";
import { activityColor } from "./pomodoro-service";
import { renderSidebarLunarWidget } from "./lunar-widget";
import type { HolidayInfo } from "./holiday-service";
import { CountdownSettingsModal } from "./countdown-modal";
import { showConfirmDialog } from "./confirm-dialog";
import { DocSearchModal } from "./quick-actions";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
);

const chartInstances = new Map<string, Chart>();

function destroyChart(cardId: string): void {
  const chart = chartInstances.get(cardId);
  if (chart) {
    chart.destroy();
    chartInstances.delete(cardId);
  }
}

export function destroyAllCharts(): void {
  for (const [, chart] of chartInstances) {
    chart.destroy();
  }
  chartInstances.clear();
}

function getCSSVar(name: string): string {
  const el = document.querySelector(".peingxious-dashboard-root");
  if (!el) return "";
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * The section title is the column name verbatim. We intentionally do
 * NOT split it into "title + trailing number" anymore — the section
 * name is a regular user-facing string (e.g. "library", "Project 5",
 * "121", "闪念-2026-01月"), the same way every other section name is
 * displayed. Treating it as a label/tag would change its meaning from
 * "name" to "id", which is misleading.
 *
 * Wikilink support: when the name contains an `[[…]]` token (e.g.
 * `[[dash01]]`, `[[dash01|别名]]`, `[[dash01#section]]`), we hand the
 * text to `renderTextWithLinks` so the inner part renders as a real
 * Obsidian internal-link — clickable, with the native Page Preview
 * popover, the same way every other dashboard wikilink does. Plain
 * text names still go through `setText` for the cheap path.
 */
function renderColumnTitle(titleEl: HTMLElement, name: string, app: App): void {
  titleEl.empty();
  if (name.includes("[[")) {
    renderTextWithLinks(titleEl, name, app);
  } else {
    titleEl.setText(name);
  }
}

let taskDragSource: { cardId: string; taskIndex: number } | null = null;
let projectItemDragSource: { cardId: string; itemIndex: number } | null = null;
let taskItemCallbacks: RenderCallbacks | null = null;
let itemDocListenersInstalled = false;

function clearTaskDragOverClasses() {
  document.querySelectorAll(".dashboard-task-item--drag-over").forEach((el) => {
    (el as HTMLElement).classList.remove("dashboard-task-item--drag-over");
  });
  document
    .querySelectorAll(".dashboard-project-item--drag-over")
    .forEach((el) => {
      (el as HTMLElement).classList.remove("dashboard-project-item--drag-over");
    });
  document
    .querySelectorAll(".dashboard-task-list--drop-target")
    .forEach((el) => {
      (el as HTMLElement).classList.remove("dashboard-task-list--drop-target");
    });
}

function ensureItemDocListeners() {
  if (itemDocListenersInstalled || typeof document === "undefined") return;
  itemDocListenersInstalled = true;

  document.addEventListener("dragstart", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a")) return;

    const taskItem = target.closest(
      ".dashboard-task-item",
    ) as HTMLElement | null;
    if (taskItem) {
      const cardId = taskItem.dataset.cardId;
      const taskIndexStr = taskItem.dataset.taskIndex;
      if (!cardId || taskIndexStr === undefined) return;
      const taskIndex = parseInt(taskIndexStr, 10);
      if (isNaN(taskIndex)) return;
      taskDragSource = { cardId, taskIndex };
      taskItem.addClass("dashboard-task-item--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(taskIndex));
      }
      console.log(
        "[dbg-renderer] taskItem dragstart cardId=" +
          cardId +
          " idx=" +
          taskIndex,
      );
      return;
    }

    const projectItem = target.closest(
      ".dashboard-project-item",
    ) as HTMLElement | null;
    if (projectItem) {
      const cardId = projectItem.dataset.cardId;
      const itemIndexStr = projectItem.dataset.itemIndex;
      if (!cardId || itemIndexStr === undefined) return;
      const itemIndex = parseInt(itemIndexStr, 10);
      if (isNaN(itemIndex)) return;
      projectItemDragSource = { cardId, itemIndex };
      projectItem.addClass("dashboard-project-item--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(itemIndex));
      }
      console.log(
        "[dbg-renderer] projectItem dragstart cardId=" +
          cardId +
          " idx=" +
          itemIndex,
      );
      return;
    }
  });

  document.addEventListener("dragend", (e) => {
    const target = e.target as HTMLElement;
    const taskItem = target.closest(
      ".dashboard-task-item",
    ) as HTMLElement | null;
    if (taskItem) {
      taskItem.classList.remove("dashboard-task-item--dragging");
      clearTaskDragOverClasses();
      taskDragSource = null;
      return;
    }
    const projectItem = target.closest(
      ".dashboard-project-item",
    ) as HTMLElement | null;
    if (projectItem) {
      projectItem.classList.remove("dashboard-project-item--dragging");
      clearTaskDragOverClasses();
      projectItemDragSource = null;
      return;
    }
    clearTaskDragOverClasses();
  });

  document.addEventListener("dragover", (e) => {
    const target = e.target as HTMLElement;

    const taskItem = target.closest(
      ".dashboard-task-item",
    ) as HTMLElement | null;
    if (taskItem && taskDragSource) {
      const cardId = taskItem.dataset.cardId;
      const taskIndex = parseInt(taskItem.dataset.taskIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(taskIndex) &&
        !(
          taskDragSource.cardId === cardId &&
          taskDragSource.taskIndex === taskIndex
        )
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearTaskDragOverClasses();
        taskItem.addClass("dashboard-task-item--drag-over");
        return;
      }
    }

    const projectItem = target.closest(
      ".dashboard-project-item",
    ) as HTMLElement | null;
    if (projectItem && projectItemDragSource) {
      const cardId = projectItem.dataset.cardId;
      const itemIndex = parseInt(projectItem.dataset.itemIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(itemIndex) &&
        !(
          projectItemDragSource.cardId === cardId &&
          projectItemDragSource.itemIndex === itemIndex
        )
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearTaskDragOverClasses();
        projectItem.addClass("dashboard-project-item--drag-over");
        return;
      }
    }

    const emptyTaskList = target.closest(
      ".dashboard-task-list",
    ) as HTMLElement | null;
    if (emptyTaskList && taskDragSource) {
      const containerCard = emptyTaskList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !== taskDragSource.cardId
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearTaskDragOverClasses();
        emptyTaskList.addClass("dashboard-task-list--drop-target");
        return;
      }
    }

    const emptyProjectList = target.closest(
      ".dashboard-project-list",
    ) as HTMLElement | null;
    if (emptyProjectList && projectItemDragSource) {
      const containerCard = emptyProjectList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !== projectItemDragSource.cardId
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearTaskDragOverClasses();
        emptyProjectList.addClass("dashboard-task-list--drop-target");
        return;
      }
    }
  });

  document.addEventListener("dragleave", (e) => {
    const target = e.target as HTMLElement;
    const taskList = target.closest(
      ".dashboard-task-list",
    ) as HTMLElement | null;
    if (taskList && !taskList.contains(e.relatedTarget as Node)) {
      taskList.classList.remove("dashboard-task-list--drop-target");
    }
    const projectList = target.closest(
      ".dashboard-project-list",
    ) as HTMLElement | null;
    if (projectList && !projectList.contains(e.relatedTarget as Node)) {
      projectList.classList.remove("dashboard-task-list--drop-target");
    }
  });

  document.addEventListener("drop", (e) => {
    const target = e.target as HTMLElement;
    if (!taskItemCallbacks) {
      return;
    }

    const taskItem = target.closest(
      ".dashboard-task-item",
    ) as HTMLElement | null;
    if (taskItem && taskDragSource) {
      const cardId = taskItem.dataset.cardId;
      const taskIndex = parseInt(taskItem.dataset.taskIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(taskIndex) &&
        !(
          taskDragSource.cardId === cardId &&
          taskDragSource.taskIndex === taskIndex
        )
      ) {
        e.preventDefault();
        clearTaskDragOverClasses();
        if (taskDragSource.cardId === cardId) {
          taskItemCallbacks.onTaskReorder(
            cardId,
            taskDragSource.taskIndex,
            taskIndex,
          );
        } else {
          taskItemCallbacks.onTaskMoveToCard(
            taskDragSource.cardId,
            taskDragSource.taskIndex,
            cardId,
            taskIndex,
          );
        }
        taskDragSource = null;
        return;
      }
    }

    const emptyTaskList = target.closest(
      ".dashboard-task-list",
    ) as HTMLElement | null;
    if (emptyTaskList && taskDragSource) {
      const containerCard = emptyTaskList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !== taskDragSource.cardId
      ) {
        const numTasks = emptyTaskList.querySelectorAll(
          ".dashboard-task-item",
        ).length;
        taskItemCallbacks.onTaskMoveToCard(
          taskDragSource.cardId,
          taskDragSource.taskIndex,
          containerCard.dataset.cardId ?? "",
          numTasks,
        );
        clearTaskDragOverClasses();
        taskDragSource = null;
        return;
      }
    }

    const projectItem = target.closest(
      ".dashboard-project-item",
    ) as HTMLElement | null;
    if (projectItem && projectItemDragSource) {
      const cardId = projectItem.dataset.cardId;
      const itemIndex = parseInt(projectItem.dataset.itemIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(itemIndex) &&
        !(
          projectItemDragSource.cardId === cardId &&
          projectItemDragSource.itemIndex === itemIndex
        )
      ) {
        e.preventDefault();
        clearTaskDragOverClasses();
        if (projectItemDragSource.cardId === cardId) {
          taskItemCallbacks.onProjectItemReorder(
            cardId,
            projectItemDragSource.itemIndex,
            itemIndex,
          );
        } else {
          taskItemCallbacks.onProjectItemMoveToCard(
            projectItemDragSource.cardId,
            projectItemDragSource.itemIndex,
            cardId,
            itemIndex,
          );
        }
        projectItemDragSource = null;
        return;
      }
    }

    const emptyProjectList = target.closest(
      ".dashboard-project-list",
    ) as HTMLElement | null;
    if (emptyProjectList && projectItemDragSource) {
      const containerCard = emptyProjectList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !== projectItemDragSource.cardId
      ) {
        taskItemCallbacks.onProjectItemMoveToCard(
          projectItemDragSource.cardId,
          projectItemDragSource.itemIndex,
          containerCard.dataset.cardId ?? "",
          0,
        );
        clearTaskDragOverClasses();
        projectItemDragSource = null;
        return;
      }
    }
  });
}

const VAULT_FILE_EXTS = new Set([
  "md",
  "pdf",
  "canvas",
  "base",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "mp3",
  "mp4",
  "m4a",
  "m4b",
  "mov",
  "mkv",
  "avi",
]);

function getSearchableFiles(app: App) {
  return app.vault
    .getFiles()
    .filter((f) => !f.path.startsWith(".") && VAULT_FILE_EXTS.has(f.extension));
}

// ===== Sidebar Widget Rendering =====

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

export function renderSidebarWidgets(
  container: HTMLElement,
  settings: import("./types").DashboardSettings,
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

  const DEFAULT_ORDER = [
    "lunar",
    "weather",
    "heatmap",
    "pomodoro",
    "reading",
    "countdown",
  ];
  const order = settings.widgetOrder?.length
    ? settings.widgetOrder
    : DEFAULT_ORDER;

  type WidgetEntry = { key: string; render: () => void };
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

type WidgetEntry = { key: string; render: () => void };

function sortByOrder(items: WidgetEntry[], order: string[]): WidgetEntry[] {
  const orderMap = new Map(order.map((k, i) => [k, i]));
  const sorted = [...items].sort((a, b) => {
    const ai = orderMap.get(a.key) ?? order.length;
    const bi = orderMap.get(b.key) ?? order.length;
    return ai - bi;
  });
  return sorted;
}

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

function renderSidebarWeather(
  container: HTMLElement,
  settings: import("./types").DashboardSettings,
  app: App,
): void {
  const widget = container.createDiv({
    cls: "dashboard-sidebar-widget dashboard-sidebar-weather",
  });
  const cityName = settings.widgetWeatherCity || "";

  widget.createDiv({ cls: "dashboard-sidebar-weather-loading", text: "..." });

  const config = {
    latitude: settings.widgetWeatherLat || 31.23,
    longitude: settings.widgetWeatherLon || 121.47,
    cityName: cityName || "Shanghai",
  };

  const cached = getCachedWeather(config);
  if (cached) {
    widget.empty();
    renderSidebarWeatherContent(widget, cached, config.cityName);
    return;
  }

  fetchWeather(config)
    .then((data) => {
      widget.empty();
      renderSidebarWeatherContent(widget, data, config.cityName);
    })
    .catch(() => {
      widget.empty();
      widget.createDiv({ cls: "dashboard-sidebar-weather-error", text: "--" });
    });
}

function renderSidebarWeatherContent(
  el: HTMLElement,
  data: import("./types").WeatherData,
  cityName: string,
): void {
  const top = el.createDiv({ cls: "dashboard-sidebar-weather-top" });
  top.createDiv({
    cls: "dashboard-sidebar-weather-icon",
    text: getWeatherEmoji(data.weatherCode),
  });
  const tempWrap = top.createDiv({
    cls: "dashboard-sidebar-weather-temp-wrap",
  });
  tempWrap.createDiv({
    cls: "dashboard-sidebar-weather-temp",
    text: `${Math.round(data.temperature)}°`,
  });

  const info = el.createDiv({ cls: "dashboard-sidebar-weather-info" });
  info.createDiv({ cls: "dashboard-sidebar-weather-city", text: cityName });
  const descLine = info.createDiv({
    cls: "dashboard-sidebar-weather-desc-line",
  });
  descLine.createSpan({
    cls: "dashboard-sidebar-weather-desc",
    text: getWeatherDescription(data.weatherCode),
  });

  const details = el.createDiv({ cls: "dashboard-sidebar-weather-details" });
  details.createDiv({
    cls: "dashboard-sidebar-weather-detail",
    text: `${t("weather.feelsLike") ?? "Feels like"} ${Math.round(data.feelsLike)}°`,
  });
  details.createDiv({
    cls: "dashboard-sidebar-weather-detail",
    text: `${t("weather.humidity") ?? "Humidity"} ${Math.round(data.humidity)}%`,
  });
  details.createDiv({
    cls: "dashboard-sidebar-weather-detail",
    text: `${Math.round(data.windSpeed)} km/h`,
  });

  if (data.dailyDates.length > 1) {
    const forecast = el.createDiv({
      cls: "dashboard-sidebar-weather-forecast",
    });
    const count = Math.min(data.dailyDates.length, 5);
    for (let i = 0; i < count; i++) {
      const day = forecast.createDiv({ cls: "dashboard-sidebar-weather-fday" });
      const d = new Date(data.dailyDates[i]! + "T00:00:00");
      const dayName = d.toLocaleDateString(
        getLanguage() === "zh" ? "zh-CN" : "en",
        { weekday: "short" },
      );
      day.createDiv({
        cls: "dashboard-sidebar-weather-fday-name",
        text: i === 0 ? (t("weather.today") ?? "Today") : dayName,
      });
      day.createDiv({
        cls: "dashboard-sidebar-weather-fday-icon",
        text: getWeatherEmoji(data.dailyCodes[i]!),
      });
      const temps = day.createDiv({
        cls: "dashboard-sidebar-weather-fday-temps",
      });
      temps.createSpan({
        cls: "dashboard-sidebar-weather-fday-high",
        text: `${Math.round(data.dailyMax[i]!)}°`,
      });
      temps.createSpan({
        cls: "dashboard-sidebar-weather-fday-low",
        text: `${Math.round(data.dailyMin[i]!)}°`,
      });
    }
  }
}

function renderSidebarHeatmap(
  container: HTMLElement,
  settings: import("./types").DashboardSettings,
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

  const weeks: (import("./types").TrackerDataPoint | null)[][] = [];
  let currentWeek: (import("./types").TrackerDataPoint | null)[] = [];
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

  // Mini stats
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

export function renderSidebarPomodoro(
  container: HTMLElement,
  service: PomodoroService,
  settings: import("./types").DashboardSettings,
): void {
  const widget = container.createDiv({
    cls: "dashboard-sidebar-widget dashboard-sidebar-pomodoro",
  });

  const state = service.getState();
  const isRunning = state.status === "running";

  // Top row: today count left + activity selector centered + stats button right
  const topRow = widget.createDiv({ cls: "dashboard-sidebar-pomodoro-top" });

  const todayCount = service.getTodayCount();
  const statsHint = topRow.createDiv({
    cls: "dashboard-sidebar-pomodoro-stats-hint",
    text: "🍅 " + t("pomodoro.today") + " " + todayCount,
  });

  topRow.createDiv({ cls: "dashboard-sidebar-pomodoro-top-spacer" });

  // Activity selector (in title position)
  const currentActivity = service.getActivity();
  const { activityTrigger, updateActivityDisplay } = createActivitySelector(
    topRow,
    service,
    currentActivity,
  );

  const statsBtn = topRow.createDiv({
    cls: "dashboard-sidebar-pomodoro-stats-btn",
  });
  setIcon(statsBtn, "bar-chart-2");

  // Ring
  const ringWrap = widget.createDiv({
    cls: "dashboard-sidebar-pomodoro-ring-wrap",
  });
  const svgSize = 72;
  const strokeWidth = 6;
  const radius = (svgSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = ringWrap.createSvg("svg", {
    cls: "dashboard-sidebar-pomodoro-ring",
    attr: {
      viewBox: `0 0 ${svgSize} ${svgSize}`,
      width: String(svgSize),
      height: String(svgSize),
    },
  });
  svg.createSvg("circle", {
    cls: "dashboard-sidebar-pomodoro-ring-bg",
    attr: {
      cx: svgSize / 2,
      cy: svgSize / 2,
      r: radius,
      "stroke-width": strokeWidth,
      fill: "none",
    },
  });
  const progressCircle = svg.createSvg("circle", {
    cls: "dashboard-sidebar-pomodoro-ring-progress",
    attr: {
      cx: svgSize / 2,
      cy: svgSize / 2,
      r: radius,
      "stroke-width": strokeWidth,
      fill: "none",
      "stroke-linecap": "round",
      "stroke-dasharray": circumference,
      "stroke-dashoffset": "0",
      transform: `rotate(-90 ${svgSize / 2} ${svgSize / 2})`,
    },
  });
  const timeText = ringWrap.createDiv({
    cls: "dashboard-sidebar-pomodoro-time",
    text: formatTime(state.remainingSeconds),
  });

  // Dots inside ring, below time
  const dotsWrap = ringWrap.createDiv({
    cls: "dashboard-sidebar-pomodoro-dots",
  });
  const interval = settings.pomodoroLongBreakInterval;
  for (let i = 0; i < interval; i++) {
    dotsWrap.createDiv({
      cls:
        "dashboard-sidebar-pomodoro-dot" +
        (i < state.completedWorkSessions
          ? " dashboard-sidebar-pomodoro-dot--filled"
          : ""),
    });
  }

  // Start/stop button
  const mainBtn = widget.createEl("button", {
    cls: "dashboard-sidebar-pomodoro-main-btn",
    text: isRunning ? t("pomodoro.stop") : t("pomodoro.startFocus"),
  });
  if (isRunning) {
    mainBtn.addClass("dashboard-sidebar-pomodoro-main-btn--running");
  }

  // --- Helpers ---
  function updateRing(remaining: number, total: number): void {
    const progress = total > 0 ? remaining / total : 1;
    progressCircle.setAttribute(
      "stroke-dashoffset",
      String(circumference * (1 - progress)),
    );
    timeText.textContent = formatTime(remaining);
  }
  updateRing(state.remainingSeconds, state.totalSeconds);

  function updateUI(): void {
    const s = service.getState();
    updateRing(s.remainingSeconds, s.totalSeconds);
    const running = s.status === "running";
    mainBtn.textContent = running
      ? t("pomodoro.stop")
      : t("pomodoro.startFocus");
    mainBtn.toggleClass(
      "dashboard-sidebar-pomodoro-main-btn--running",
      running,
    );
    const dots = dotsWrap.querySelectorAll(".dashboard-sidebar-pomodoro-dot");
    dots.forEach((dot, i) =>
      dot.toggleClass(
        "dashboard-sidebar-pomodoro-dot--filled",
        i < s.completedWorkSessions,
      ),
    );
    const tc = service.getTodayCount();
    statsHint.textContent = t("pomodoro.today") + " " + tc;
  }

  service.setOnTick(() => {
    const s = service.getState();
    updateRing(s.remainingSeconds, s.totalSeconds);
  });

  service.setOnComplete(() => updateUI());

  mainBtn.addEventListener("click", () => {
    if (service.getState().status === "running") {
      service.reset();
      updateUI();
    } else {
      service.start();
      updateUI();
    }
  });

  statsBtn.addEventListener("click", () => {
    showPomodoroStats(widget.ownerDocument, service);
  });
}

function createActivitySelector(
  parent: HTMLElement,
  service: PomodoroService,
  initialActivity: string,
): {
  activityTrigger: HTMLElement;
  updateActivityDisplay: (name: string) => void;
} {
  const wrap = parent.createDiv({
    cls: "dashboard-pomodoro-activity-selector",
  });

  const trigger = wrap.createDiv({
    cls:
      "dashboard-pomodoro-activity-trigger" +
      (initialActivity ? " dashboard-pomodoro-activity-trigger--set" : ""),
  });

  let colorDot: HTMLElement | null = null;
  let nameSpan: HTMLElement;

  if (initialActivity) {
    colorDot = trigger.createDiv({
      cls: "dashboard-pomodoro-activity-color-dot",
    });
    colorDot.style.backgroundColor = activityColor(initialActivity);
    nameSpan = trigger.createSpan({ text: initialActivity });
  } else {
    nameSpan = trigger.createSpan({
      text: t("pomodoro.tapToSetActivity"),
      cls: "dashboard-pomodoro-activity-placeholder",
    });
  }

  let panel: HTMLElement | null = null;

  function updateActivityDisplay(name: string): void {
    trigger.empty();
    trigger.toggleClass(
      "dashboard-pomodoro-activity-trigger--set",
      name.length > 0,
    );
    if (name) {
      const dot = trigger.createDiv({
        cls: "dashboard-pomodoro-activity-color-dot",
      });
      dot.style.backgroundColor = activityColor(name);
      nameSpan = trigger.createSpan({ text: name });
    } else {
      nameSpan = trigger.createSpan({
        text: t("pomodoro.tapToSetActivity"),
        cls: "dashboard-pomodoro-activity-placeholder",
      });
    }
  }

  function closePanel(): void {
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  function openPanel(): void {
    closePanel();

    panel = wrap.createDiv({ cls: "dashboard-pomodoro-activity-panel" });

    const input = panel.createEl("input", {
      cls: "dashboard-pomodoro-activity-panel-input",
      attr: { type: "text", placeholder: t("pomodoro.inputActivity") },
    });

    const recentActivities = service.getRecentActivities(6);
    if (recentActivities.length > 0) {
      const chipsWrap = panel.createDiv({
        cls: "dashboard-pomodoro-activity-chips",
      });
      for (const act of recentActivities) {
        const chip = chipsWrap.createDiv({
          cls: "dashboard-pomodoro-activity-chip",
        });
        const dot = chip.createDiv({
          cls: "dashboard-pomodoro-activity-color-dot",
        });
        dot.style.backgroundColor = activityColor(act);
        chip.createSpan({ text: act });
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          service.setActivity(act);
          updateActivityDisplay(act);
          closePanel();
        });
      }
    }

    input.focus();

    const finish = (save: boolean) => {
      const val = input.value.trim();
      if (save && val) {
        service.setActivity(val);
        updateActivityDisplay(val);
      }
      closePanel();
    };

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel) {
      closePanel();
    } else {
      openPanel();
    }
  });

  // Close panel when clicking outside
  const doc = parent.ownerDocument;
  const onDocClick = (e: MouseEvent) => {
    if (
      panel &&
      !panel.contains(e.target as Node) &&
      !trigger.contains(e.target as Node)
    ) {
      closePanel();
    }
  };
  doc.addEventListener("click", onDocClick);

  return { activityTrigger: trigger, updateActivityDisplay };
}

export function renderSidebarCountdown(
  container: HTMLElement,
  settings: import("./types").DashboardSettings,
  app: App,
): void {
  const widget = container.createDiv({
    cls: "dashboard-sidebar-widget dashboard-sidebar-countdown",
  });

  // Settings button (absolute positioned)
  const settingsBtn = widget.createEl("button", {
    cls: "dashboard-sidebar-countdown-settings-btn",
    attr: { "aria-label": t("countdown.settingsTitle") },
  });
  setIcon(settingsBtn, "settings");

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const modal = new CountdownSettingsModal(app, settings, async (updates) => {
      Object.assign(settings, updates);
      const plugin = (
        app as unknown as {
          plugins: {
            plugins: Record<
              string,
              {
                settings?: import("./types").DashboardSettings;
                saveSettings?: () => Promise<void>;
                refreshAllDashboards?: () => void;
              }
            >;
          };
        }
      ).plugins?.plugins?.["peingxious-dashboard"];
      if (plugin?.settings) {
        Object.assign(plugin.settings!, updates);
        await plugin.saveSettings?.();
        plugin.refreshAllDashboards?.();
      }
    });
    modal.open();
  });

  // Content
  const content = widget.createDiv({
    cls: "dashboard-sidebar-countdown-content",
  });

  const targetDate = settings.countdownTargetDate;
  if (!targetDate) {
    content.createDiv({
      cls: "dashboard-sidebar-countdown-placeholder",
      text: t("countdown.setTarget"),
    });
    return;
  }

  const target = targetDate.includes("T")
    ? new Date(targetDate)
    : new Date(targetDate + "T00:00:00");
  const now = new Date();

  if (now >= target) {
    if (settings.countdownLabel) {
      content.createDiv({
        cls: "dashboard-sidebar-countdown-until",
        text: t("countdown.untilLabel", { label: settings.countdownLabel }),
      });
    }
    content.createDiv({
      cls: "dashboard-sidebar-countdown-expired",
      text: t("countdown.expired"),
    });
    return;
  }

  const diffMs = target.getTime() - now.getTime();
  const remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const remainHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const displayMode = settings.countdownDisplayMode;
  const remainMinutes = Math.ceil(diffMs / (1000 * 60));
  const currentVal =
    displayMode === "minutes"
      ? remainMinutes
      : displayMode === "hours"
        ? remainHours
        : remainDays;

  // "距离xx还有" label above the number
  if (settings.countdownLabel) {
    content.createDiv({
      cls: "dashboard-sidebar-countdown-until",
      text: t("countdown.untilLabel", { label: settings.countdownLabel }),
    });
  }

  // Value display with flip
  const flipWrap = content.createDiv({
    cls: "dashboard-sidebar-countdown-flip",
  });
  const valueEl = flipWrap.createDiv({
    cls: "dashboard-sidebar-countdown-value",
    text: String(currentVal),
  });
  flipWrap.createDiv({
    cls: "dashboard-sidebar-countdown-unit",
    text:
      displayMode === "minutes"
        ? t("countdown.minutes")
        : displayMode === "hours"
          ? t("countdown.hours")
          : t("countdown.days"),
  });

  // Auto-refresh with flip animation
  let prevVal = currentVal;
  const timer = setInterval(() => {
    const now2 = new Date();
    if (now2 >= target) {
      clearInterval(timer);
      content.empty();
      content.createDiv({
        cls: "dashboard-sidebar-countdown-expired",
        text: t("countdown.expired"),
      });
      return;
    }
    const diff = target.getTime() - now2.getTime();
    const newVal =
      displayMode === "minutes"
        ? Math.ceil(diff / (1000 * 60))
        : displayMode === "hours"
          ? Math.ceil(diff / (1000 * 60 * 60))
          : Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (newVal !== prevVal) {
      prevVal = newVal;
      valueEl.textContent = String(newVal);
      valueEl.addClass("dashboard-sidebar-countdown-value--flip");
      setTimeout(
        () => valueEl.removeClass("dashboard-sidebar-countdown-value--flip"),
        400,
      );
    }
  }, 60000);
}

function showPomodoroStats(doc: Document, service: PomodoroService): void {
  const overlay = doc.body.createDiv({
    cls: "dashboard-pomodoro-stats-overlay",
  });
  const modal = overlay.createDiv({ cls: "dashboard-pomodoro-stats-modal" });

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  doc.addEventListener("keydown", onKey);

  // Header
  const header = modal.createDiv({ cls: "dashboard-pomodoro-stats-header" });
  header.createDiv({
    cls: "dashboard-pomodoro-stats-header-title",
    text: t("pomodoro.statsTitle"),
  });
  const closeBtn = header.createDiv({ cls: "dashboard-pomodoro-stats-close" });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", () => close());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Summary cards
  const summary = modal.createDiv({ cls: "dashboard-pomodoro-stats-summary" });

  const totalMin = service.getTotalFocusMinutes();
  const todayMin = service.getTodayFocusMinutes();
  const streak = service.getStreak();

  const totalCard = summary.createDiv({ cls: "dashboard-pomodoro-stats-card" });
  totalCard.createDiv({
    cls: "dashboard-pomodoro-stats-card-value",
    text: formatMinutes(totalMin),
  });
  totalCard.createDiv({
    cls: "dashboard-pomodoro-stats-card-label",
    text: t("pomodoro.totalFocus"),
  });

  const todayCard = summary.createDiv({ cls: "dashboard-pomodoro-stats-card" });
  todayCard.createDiv({
    cls: "dashboard-pomodoro-stats-card-value",
    text: formatMinutes(todayMin),
  });
  todayCard.createDiv({
    cls: "dashboard-pomodoro-stats-card-label",
    text: t("pomodoro.todayFocus"),
  });

  const streakCard = summary.createDiv({
    cls: "dashboard-pomodoro-stats-card",
  });
  streakCard.createDiv({
    cls: "dashboard-pomodoro-stats-card-value",
    text: String(streak),
  });
  streakCard.createDiv({
    cls: "dashboard-pomodoro-stats-card-label",
    text: t("pomodoro.streakDays"),
  });

  // Donut chart section with range toggle
  const donutSection = modal.createDiv({
    cls: "dashboard-pomodoro-stats-section",
  });

  // Range toggle: Day / Week / Month
  const rangeToggle = donutSection.createDiv({
    cls: "dashboard-pomodoro-range-toggle",
  });
  const ranges: { key: string; label: string; days: number }[] = [
    { key: "day", label: t("pomodoro.rangeDay"), days: 1 },
    { key: "week", label: t("pomodoro.rangeWeek"), days: 7 },
    { key: "month", label: t("pomodoro.rangeMonth"), days: 30 },
  ];
  let activeRange = "week";

  const toggleButtons = ranges.map((r) => {
    const btn = rangeToggle.createDiv({
      cls:
        "dashboard-pomodoro-range-btn" +
        (r.key === activeRange ? " dashboard-pomodoro-range-btn--active" : ""),
      text: r.label,
    });
    return btn;
  });

  // Donut chart container
  const donutContainer = donutSection.createDiv({
    cls: "dashboard-pomodoro-donut-container",
  });

  function renderDonut(rangeKey: string): void {
    donutContainer.empty();

    const rangeInfo = ranges.find((r) => r.key === rangeKey);
    if (!rangeInfo) return;

    const breakdown = service.getActivityBreakdownByRange(rangeInfo.days);
    const sorted = [...breakdown.entries()].sort((a, b) => b[1] - a[1]);
    const totalRangeMin = sorted.reduce((sum, [, m]) => sum + m, 0);

    if (totalRangeMin === 0) {
      donutContainer.createDiv({
        cls: "dashboard-pomodoro-donut-empty",
        text: t("pomodoro.noRecords"),
      });
      return;
    }

    // SVG donut chart
    const size = 160;
    const strokeWidth = 28;
    const donutR = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * donutR;

    const svg = donutContainer.createSvg("svg", {
      cls: "dashboard-pomodoro-donut-svg",
      attr: {
        viewBox: `0 0 ${size} ${size}`,
        width: String(size),
        height: String(size),
      },
    });

    // Background circle
    svg.createSvg("circle", {
      attr: {
        cx: size / 2,
        cy: size / 2,
        r: donutR,
        fill: "none",
        "stroke-width": strokeWidth,
      },
      cls: "dashboard-pomodoro-donut-bg",
    });

    // Draw arcs
    let offset = 0;
    const gap = sorted.length > 1 ? 3 : 0;
    for (const [name, mins] of sorted) {
      const pct = mins / totalRangeMin;
      const dashLen = Math.max(0, circumference * pct - gap);
      const circle = svg.createSvg("circle", {
        cls: "dashboard-pomodoro-donut-segment",
        attr: {
          cx: size / 2,
          cy: size / 2,
          r: donutR,
          fill: "none",
          "stroke-width": strokeWidth,
          "stroke-dasharray": `${dashLen} ${circumference - dashLen}`,
          "stroke-dashoffset": String(-offset),
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
          "stroke-linecap": "butt",
        },
      });
      circle.style.stroke = activityColor(name);
      offset += dashLen + gap;
    }

    // Center text: total time
    const centerValue = svg.createSvg("text", {
      attr: {
        x: size / 2,
        y: size / 2 - 6,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      },
      cls: "dashboard-pomodoro-donut-center-value",
    });
    centerValue.textContent = formatMinutes(totalRangeMin);

    const centerLabel = svg.createSvg("text", {
      attr: {
        x: size / 2,
        y: size / 2 + 14,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      },
      cls: "dashboard-pomodoro-donut-center-label",
    });
    centerLabel.textContent = rangeInfo.label;

    // Legend with percentages
    const legend = donutContainer.createDiv({
      cls: "dashboard-pomodoro-donut-legend",
    });
    for (const [name, mins] of sorted) {
      const pct = Math.round((mins / totalRangeMin) * 100);
      const item = legend.createDiv({
        cls: "dashboard-pomodoro-donut-legend-item",
      });
      const dot = item.createDiv({
        cls: "dashboard-pomodoro-donut-legend-dot",
      });
      dot.style.backgroundColor = activityColor(name);
      item.createDiv({
        cls: "dashboard-pomodoro-donut-legend-name",
        text: name,
      });
      item.createDiv({
        cls: "dashboard-pomodoro-donut-legend-pct",
        text: pct + "%",
      });
      item.createDiv({
        cls: "dashboard-pomodoro-donut-legend-time",
        text: formatMinutes(mins),
      });
    }
  }

  // Toggle handlers
  toggleButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      activeRange = ranges[i]!.key;
      toggleButtons.forEach((b, j) =>
        b.toggleClass("dashboard-pomodoro-range-btn--active", j === i),
      );
      renderDonut(activeRange);
    });
  });

  renderDonut(activeRange);

  // Recent sessions with activity color dots
  const recentRecords = service.getRecentRecords(10);
  if (recentRecords.length > 0) {
    const recentSection = modal.createDiv({
      cls: "dashboard-pomodoro-stats-section",
    });
    recentSection.createDiv({
      cls: "dashboard-pomodoro-stats-section-title",
      text: t("pomodoro.recentSessions"),
    });
    for (const rec of recentRecords) {
      const row = recentSection.createDiv({
        cls: "dashboard-pomodoro-stats-record-row",
      });
      const actDot = row.createDiv({
        cls: "dashboard-pomodoro-stats-record-dot",
      });
      actDot.style.backgroundColor = activityColor(
        rec.activity || t("pomodoro.defaultActivity"),
      );
      const ts = new Date(rec.timestamp);
      const dateStr =
        ts.getMonth() +
        1 +
        "/" +
        ts.getDate() +
        " " +
        String(ts.getHours()).padStart(2, "0") +
        ":" +
        String(ts.getMinutes()).padStart(2, "0");
      row.createDiv({
        cls: "dashboard-pomodoro-stats-record-date",
        text: dateStr,
      });
      row.createDiv({
        cls: "dashboard-pomodoro-stats-record-activity",
        text: rec.activity,
      });
      row.createDiv({
        cls: "dashboard-pomodoro-stats-record-duration",
        text: rec.duration + " min",
      });
    }
  }
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return t("pomodoro.minutes", { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return t("pomodoro.hours", { count: hours });
  return (
    t("pomodoro.hours", { count: hours }) +
    " " +
    t("pomodoro.minutes", { count: mins })
  );
}

function formatTime(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatReadingDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && mins > 0) return t("reading.timeHM", { h: hours, m: mins });
  if (hours > 0) return t("reading.hours", { count: hours });
  return t("reading.minutes", { count: Math.max(1, mins) });
}

function formatShortDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + "m" : ""}`;
  return `${Math.max(1, m)}m`;
}

export function renderSidebarReading(
  container: HTMLElement,
  service: ReadingService,
): void {
  const widget = container.createDiv({
    cls: "dashboard-sidebar-widget dashboard-sidebar-reading",
  });

  // Title row
  const titleRow = widget.createDiv({ cls: "dashboard-reading-title-row" });
  titleRow.createDiv({
    cls: "dashboard-reading-title",
    text: t("reading.title"),
  });
  titleRow.createDiv({ cls: "dashboard-reading-title-spacer" });
  const addBtn = titleRow.createDiv({ cls: "dashboard-reading-add-btn" });
  setIcon(addBtn, "plus");
  const statsBtn = titleRow.createDiv({ cls: "dashboard-reading-stats-btn" });
  setIcon(statsBtn, "bar-chart-2");

  // Book cards scroll area
  const scrollArea = widget.createDiv({ cls: "dashboard-reading-scroll" });

  const state = service.getState();
  const activeBooks = service.getActiveBooks();

  for (const book of activeBooks) {
    const isActive =
      state.status !== "idle" && state.currentBook?.title === book.title;
    const isRunning = isActive && state.status === "running";
    const card = scrollArea.createDiv({
      cls:
        "dashboard-reading-book-card" +
        (isActive ? " dashboard-reading-book-card--active" : ""),
    });

    // Cover - always show title fallback, async load real cover
    const coverWrap = card.createDiv({
      cls: "dashboard-reading-book-card-cover-wrap",
    });
    const placeholder = coverWrap.createDiv({
      cls: "dashboard-reading-book-card-cover-placeholder",
    });
    placeholder.textContent =
      book.title.length > 8 ? book.title.slice(0, 8) + ".." : book.title;
    if (book.coverUrl) {
      downloadCoverAsBlobUrl(book.coverUrl).then((blobUrl) => {
        if (blobUrl) {
          placeholder.style.display = "none";
          coverWrap.style.backgroundImage = `url(${blobUrl})`;
        }
      });
    }

    // Info area
    const info = card.createDiv({ cls: "dashboard-reading-book-card-info" });
    info.createDiv({
      cls: "dashboard-reading-book-card-title",
      text: book.title,
    });
    if (book.author) {
      info.createDiv({
        cls: "dashboard-reading-book-card-author",
        text: book.author,
      });
    }

    // Timer row
    const timerRow = info.createDiv({
      cls: "dashboard-reading-book-card-timer",
    });

    if (isActive) {
      timerRow.createDiv({
        cls: "dashboard-reading-book-card-time dashboard-reading-book-card-time--active",
        text: formatTime(state.elapsedSeconds),
      });
    } else {
      const todaySec = service.getTodaySecondsForBook(book.title);
      timerRow.createDiv({
        cls: "dashboard-reading-book-card-time",
        text: todaySec > 0 ? formatShortDuration(todaySec) : "--",
      });
    }

    // Play/pause/stop buttons
    const actions = timerRow.createDiv({
      cls: "dashboard-reading-book-card-actions",
    });

    if (isRunning) {
      const pauseBtn = actions.createDiv({
        cls: "dashboard-reading-book-card-btn dashboard-reading-book-card-btn--pause",
      });
      setIcon(pauseBtn, "pause");
      pauseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        service.pause();
        refreshCards();
      });
      const stopBtn = actions.createDiv({
        cls: "dashboard-reading-book-card-btn dashboard-reading-book-card-btn--stop",
      });
      setIcon(stopBtn, "square");
      stopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        service.pause();
        showEndModal(book);
      });
    } else if (isActive && state.status === "paused") {
      const resumeBtn = actions.createDiv({
        cls: "dashboard-reading-book-card-btn dashboard-reading-book-card-btn--play",
      });
      setIcon(resumeBtn, "play");
      resumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        service.resume();
        refreshCards();
      });
      const stopBtn = actions.createDiv({
        cls: "dashboard-reading-book-card-btn dashboard-reading-book-card-btn--stop",
      });
      setIcon(stopBtn, "square");
      stopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEndModal(book);
      });
    } else {
      const playBtn = actions.createDiv({
        cls: "dashboard-reading-book-card-btn dashboard-reading-book-card-btn--play",
      });
      setIcon(playBtn, "play");
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        service.startReading(book);
        refreshCards();
      });
    }

    // Progress bar
    if (book.totalPages > 0) {
      const progressWrap = info.createDiv({
        cls: "dashboard-reading-book-card-progress",
      });
      const pct = book.finished
        ? 100
        : Math.min(100, Math.round((book.currentPage / book.totalPages) * 100));
      const progressBar = progressWrap.createDiv({
        cls: "dashboard-reading-book-card-progress-bar",
      });
      progressBar.createDiv({
        cls:
          "dashboard-reading-book-card-progress-fill" +
          (book.finished
            ? " dashboard-reading-book-card-progress-fill--done"
            : ""),
        attr: { style: `width:${pct}%` },
      });
      progressWrap.createDiv({
        cls: "dashboard-reading-book-card-progress-text",
        text: book.finished ? "100%" : `${book.currentPage}/${book.totalPages}`,
      });
    }

    // Action buttons (edit / remove)
    const editBtn = card.createDiv({
      cls: "dashboard-reading-book-card-action dashboard-reading-book-card-edit",
    });
    setIcon(editBtn, "pencil");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditBookInfo(widget.ownerDocument, service, book, () =>
        refreshCards(),
      );
    });

    const removeBtn = card.createDiv({
      cls: "dashboard-reading-book-card-action dashboard-reading-book-card-remove",
    });
    setIcon(removeBtn, "x");
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      service.removeActiveBook(book.title).then(() => refreshCards());
    });
  }

  // Timer tick - update active timer display
  service.setOnTick(() => {
    const s = service.getState();
    if (s.status === "running") {
      const activeTime = scrollArea.querySelector(
        ".dashboard-reading-book-card-time--active",
      );
      if (activeTime) activeTime.textContent = formatTime(s.elapsedSeconds);
    }
  });

  addBtn.addEventListener("click", () => {
    openBookSearch(widget.ownerDocument, service, (book) => {
      if (book) service.addActiveBook(book).then(() => refreshCards());
    });
  });

  statsBtn.addEventListener("click", () => {
    showReadingStats(widget.ownerDocument, service);
  });

  function showEndModal(book: import("./reading-service").BookInfo): void {
    const elapsed = service.getElapsedSeconds();
    openEndReadingModal(widget.ownerDocument, service, book, elapsed, () =>
      refreshCards(),
    );
  }

  function refreshCards(): void {
    service.setOnTick(null);
    const parent = widget.parentElement!;
    widget.remove();
    renderSidebarReading(parent, service);
  }
}

function openEndReadingModal(
  doc: Document,
  service: ReadingService,
  book: import("./reading-service").BookInfo,
  elapsedSeconds: number,
  onDone: () => void,
): void {
  const overlay = doc.body.createDiv({ cls: "dashboard-reading-end-overlay" });
  const modal = overlay.createDiv({ cls: "dashboard-reading-end-modal" });

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  doc.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Header
  const header = modal.createDiv({ cls: "dashboard-reading-end-header" });
  header.createDiv({
    cls: "dashboard-reading-end-title",
    text: t("reading.endTitle"),
  });
  const closeBtn = header.createDiv({ cls: "dashboard-reading-end-close" });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", close);

  // Body
  const body = modal.createDiv({ cls: "dashboard-reading-end-body" });

  // Date row
  const dateRow = body.createDiv({ cls: "dashboard-reading-end-row" });
  dateRow.createDiv({
    cls: "dashboard-reading-end-label",
    text: t("reading.endDate"),
  });
  const now = new Date();
  dateRow.createDiv({
    cls: "dashboard-reading-end-value",
    text: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  });

  // Duration row
  const durRow = body.createDiv({ cls: "dashboard-reading-end-row" });
  durRow.createDiv({
    cls: "dashboard-reading-end-label",
    text: t("reading.endDuration"),
  });
  durRow.createDiv({
    cls: "dashboard-reading-end-value",
    text: formatReadingDuration(elapsedSeconds),
  });

  // Progress section
  const progressSection = body.createDiv({
    cls: "dashboard-reading-end-section",
  });
  progressSection.createDiv({
    cls: "dashboard-reading-end-section-title",
    text: t("reading.endProgress"),
  });

  // Mode toggle: page / percentage
  let progressMode: "page" | "pct" = book.totalPages > 0 ? "page" : "pct";
  const modeToggle = progressSection.createDiv({
    cls: "dashboard-reading-end-mode-toggle",
  });
  const pageModeBtn = modeToggle.createDiv({
    cls:
      "dashboard-reading-end-mode-btn" +
      (progressMode === "page"
        ? " dashboard-reading-end-mode-btn--active"
        : ""),
    text: t("reading.endModePage"),
  });
  const pctModeBtn = modeToggle.createDiv({
    cls:
      "dashboard-reading-end-mode-btn" +
      (progressMode === "pct" ? " dashboard-reading-end-mode-btn--active" : ""),
    text: t("reading.endModePct"),
  });

  // Inputs container
  const inputsContainer = progressSection.createDiv({
    cls: "dashboard-reading-end-inputs",
  });

  function renderInputs(): void {
    inputsContainer.empty();
    const pageRow = inputsContainer.createDiv({
      cls: "dashboard-reading-end-page-row",
    });

    // Start value (readonly)
    const startCol = pageRow.createDiv({
      cls: "dashboard-reading-end-page-col",
    });
    startCol.createDiv({
      cls: "dashboard-reading-end-page-label",
      text: t("reading.endStartPage"),
    });
    const startVal =
      progressMode === "pct"
        ? book.totalPages > 0
          ? Math.round((book.currentPage / book.totalPages) * 100)
          : 0
        : book.currentPage;
    const suffix = progressMode === "pct" ? "%" : "";
    startCol.createDiv({
      cls: "dashboard-reading-end-page-readonly",
      text: `${startVal}${suffix}`,
    });

    pageRow.createDiv({ cls: "dashboard-reading-end-page-arrow" });

    // End value (input)
    const endCol = pageRow.createDiv({ cls: "dashboard-reading-end-page-col" });
    endCol.createDiv({
      cls: "dashboard-reading-end-page-label",
      text: t("reading.endEndPage"),
    });
    const endInput = endCol.createEl("input", {
      cls: "dashboard-reading-end-page-input",
      attr: {
        type: "number",
        min: "0",
        max: progressMode === "pct" ? "100" : "",
        placeholder: progressMode === "pct" ? "0%" : "0",
      },
    });
    endInput.focus();

    // Total pages row (page mode, unknown total)
    if (progressMode === "page" && !book.totalPages) {
      const totalRow = inputsContainer.createDiv({
        cls: "dashboard-reading-end-total-row",
      });
      totalRow.createDiv({
        cls: "dashboard-reading-end-page-label",
        text: t("reading.endTotalPages"),
      });
      totalRow.createEl("input", {
        cls: "dashboard-reading-end-page-input dashboard-reading-end-page-input--total",
        attr: { type: "number", min: "0", placeholder: "?" },
      });
    }
  }
  renderInputs();

  pageModeBtn.addEventListener("click", () => {
    progressMode = "page";
    pageModeBtn.addClass("dashboard-reading-end-mode-btn--active");
    pctModeBtn.removeClass("dashboard-reading-end-mode-btn--active");
    renderInputs();
  });
  pctModeBtn.addEventListener("click", () => {
    progressMode = "pct";
    pctModeBtn.addClass("dashboard-reading-end-mode-btn--active");
    pageModeBtn.removeClass("dashboard-reading-end-mode-btn--active");
    renderInputs();
  });

  // Finished checkbox
  const finishedRow = body.createDiv({ cls: "dashboard-reading-end-finished" });
  const checkbox = finishedRow.createEl("input", {
    cls: "dashboard-reading-end-checkbox",
    attr: { type: "checkbox", id: "reading-finished" },
  });
  const checkLabel = finishedRow.createEl("label", {
    cls: "dashboard-reading-end-checkbox-label",
    attr: { for: "reading-finished" },
  });
  checkLabel.textContent = t("reading.endMarkFinished");

  // Footer
  const footer = modal.createDiv({ cls: "dashboard-reading-end-footer" });

  footer
    .createEl("button", {
      cls: "dashboard-reading-end-btn dashboard-reading-end-btn--cancel",
      text: t("reading.endCancel"),
    })
    .addEventListener("click", close);

  footer
    .createEl("button", {
      cls: "dashboard-reading-end-btn dashboard-reading-end-btn--discard",
      text: t("reading.endDiscard"),
    })
    .addEventListener("click", () => {
      service.discardSession();
      close();
      onDone();
    });

  footer
    .createEl("button", {
      cls: "dashboard-reading-end-btn dashboard-reading-end-btn--confirm",
      text: t("reading.endConfirm"),
    })
    .addEventListener("click", async () => {
      const endInput = inputsContainer.querySelector(
        ".dashboard-reading-end-page-input:not(.dashboard-reading-end-page-input--total)",
      ) as HTMLInputElement | null;
      const totalInput = inputsContainer.querySelector(
        ".dashboard-reading-end-page-input--total",
      ) as HTMLInputElement | null;
      const endVal = parseInt(endInput?.value || "0") || 0;
      const finished = checkbox.checked;

      let endPage: number;
      let totalPages = book.totalPages;

      if (progressMode === "pct") {
        if (totalPages > 0) {
          endPage = Math.round((Math.min(endVal, 100) / 100) * totalPages);
        } else {
          endPage = Math.min(endVal, 100);
          totalPages = 100;
        }
      } else {
        endPage = endVal;
        if (totalInput) {
          totalPages = parseInt(totalInput.value) || 0;
        }
      }

      await service.finishSession(endPage, totalPages, finished);
      close();
      onDone();
    });
}

function openEditBookInfo(
  doc: Document,
  service: ReadingService,
  book: import("./reading-service").BookInfo,
  onDone: () => void,
): void {
  const overlay = doc.body.createDiv({ cls: "dashboard-reading-end-overlay" });
  const modal = overlay.createDiv({ cls: "dashboard-reading-end-modal" });

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  doc.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const header = modal.createDiv({ cls: "dashboard-reading-end-header" });
  header.createDiv({
    cls: "dashboard-reading-end-title",
    text: t("reading.editTitle"),
  });
  const closeBtn = header.createDiv({ cls: "dashboard-reading-end-close" });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", close);

  const body = modal.createDiv({ cls: "dashboard-reading-end-body" });

  body.createDiv({
    cls: "dashboard-reading-end-label",
    text: t("reading.editBookName"),
  });
  const titleInput = body.createEl("input", {
    cls: "dashboard-reading-end-input",
    attr: { type: "text" },
  });
  titleInput.value = book.title;

  body.createDiv({
    cls: "dashboard-reading-end-label",
    text: t("reading.editAuthorName"),
  });
  const authorInput = body.createEl("input", {
    cls: "dashboard-reading-end-input",
    attr: { type: "text" },
  });
  authorInput.value = book.author;

  body.createDiv({
    cls: "dashboard-reading-end-label",
    text: t("reading.editTotalPages"),
  });
  const pagesInput = body.createEl("input", {
    cls: "dashboard-reading-end-input",
    attr: { type: "number", min: "0" },
  });
  pagesInput.value = String(book.totalPages || "");

  body.createDiv({
    cls: "dashboard-reading-end-label",
    text: t("reading.editCoverUrl"),
  });
  const coverInput = body.createEl("input", {
    cls: "dashboard-reading-end-input",
    attr: { type: "text", placeholder: t("reading.editCoverPlaceholder") },
  });
  coverInput.value = book.coverUrl;

  const footer = modal.createDiv({ cls: "dashboard-reading-end-footer" });
  const saveBtn = footer.createEl("button", {
    cls: "dashboard-reading-end-btn dashboard-reading-end-btn--confirm",
    text: t("reading.editConfirm"),
  });
  footer
    .createEl("button", {
      cls: "dashboard-reading-end-btn dashboard-reading-end-btn--cancel",
      text: t("reading.endCancel"),
    })
    .addEventListener("click", close);

  const deleteBtn = footer.createEl("button", {
    cls: "dashboard-reading-end-btn dashboard-reading-end-btn--delete",
    text: t("reading.editDeleteBook"),
  });
  deleteBtn.addEventListener("click", async () => {
    await service.removeActiveBook(book.title);
    close();
    onDone();
  });

  saveBtn.addEventListener("click", async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) return;

    await service.updateBookInfo(book.title, {
      title: newTitle,
      author: authorInput.value.trim(),
      coverUrl: coverInput.value.trim(),
      totalPages: parseInt(pagesInput.value) || 0,
    });
    close();
    onDone();
  });

  titleInput.focus();
}

function openBookSearch(
  doc: Document,
  service: ReadingService,
  onSelect: (book: import("./reading-service").BookInfo | null) => void,
): void {
  const overlay = doc.body.createDiv({ cls: "dashboard-reading-book-overlay" });
  const modal = overlay.createDiv({ cls: "dashboard-reading-book-modal" });

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  doc.addEventListener("keydown", onKey);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const header = modal.createDiv({ cls: "dashboard-reading-book-header" });
  header.createDiv({
    cls: "dashboard-reading-book-header-title",
    text: t("reading.selectBook"),
  });
  const closeBtn = header.createDiv({ cls: "dashboard-reading-book-close" });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", close);

  const inputArea = modal.createDiv({
    cls: "dashboard-reading-book-input-area",
  });
  const input = inputArea.createEl("input", {
    cls: "dashboard-reading-book-input",
    attr: { type: "text", placeholder: t("reading.searchBook") },
  });
  input.focus();

  const resultsArea = modal.createDiv({
    cls: "dashboard-reading-book-results",
  });

  // Manual input row (always at bottom)
  const manualRow = resultsArea.createDiv({
    cls: "dashboard-reading-book-manual",
  });
  manualRow.createDiv({
    cls: "dashboard-reading-book-manual-label",
    text: t("reading.manualInput"),
  });
  const manualInput = manualRow.createEl("input", {
    cls: "dashboard-reading-book-manual-input",
    attr: { type: "text", placeholder: t("reading.manualPlaceholder") },
  });
  const manualBtn = manualRow.createEl("button", {
    cls: "dashboard-reading-book-manual-btn",
    text: "OK",
  });
  manualBtn.addEventListener("click", () => {
    const val = manualInput.value.trim();
    if (val) {
      onSelect({
        title: val,
        author: "",
        coverUrl: "",
        isbn: "",
        source: "manual",
        currentPage: 0,
        totalPages: 0,
        finished: false,
        totalSeconds: 0,
        sessions: 0,
      });
      close();
    }
  });

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let searching = false;

  input.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    const query = input.value.trim();

    // Remove previous search results (keep manual row)
    while (resultsArea.firstChild && resultsArea.firstChild !== manualRow) {
      resultsArea.removeChild(resultsArea.firstChild!);
    }

    if (!query) return;

    const indicator = resultsArea.createDiv({
      cls: "dashboard-reading-book-searching",
      text: t("reading.searching"),
    });
    resultsArea.insertBefore(indicator, manualRow);

    searchTimer = setTimeout(async () => {
      if (searching) return;
      searching = true;

      let results: import("./book-service").BookSearchResult[] = [];
      try {
        results = await searchBooks(query);
      } catch {
        results = [];
      }
      searching = false;

      // Remove previous results
      while (resultsArea.firstChild && resultsArea.firstChild !== manualRow) {
        resultsArea.removeChild(resultsArea.firstChild!);
      }

      if (results.length === 0) {
        const noResult = resultsArea.createDiv({
          cls: "dashboard-reading-book-no-results",
          text: t("reading.noResults"),
        });
        resultsArea.insertBefore(noResult, manualRow);
        return;
      }

      for (const book of results) {
        const item = resultsArea.createDiv({
          cls: "dashboard-reading-book-item",
        });
        if (book.coverUrl) {
          const c = item.createDiv({
            cls: "dashboard-reading-book-item-cover",
          });
          downloadCoverAsBlobUrl(book.coverUrl).then((url) => {
            if (url) c.style.backgroundImage = `url(${url})`;
          });
        } else {
          item.createDiv({ cls: "dashboard-reading-book-item-nocover" });
        }
        const info = item.createDiv({
          cls: "dashboard-reading-book-item-info",
        });
        info.createDiv({
          cls: "dashboard-reading-book-item-title",
          text: book.title,
        });
        if (book.author) {
          info.createDiv({
            cls: "dashboard-reading-book-item-author",
            text: book.author,
          });
        }
        item.addEventListener("click", () => {
          onSelect({
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl,
            isbn: book.isbn,
            source: "openlibrary",
            currentPage: 0,
            totalPages: 0,
            finished: false,
            totalSeconds: 0,
            sessions: 0,
          });
          close();
        });
        resultsArea.insertBefore(item, manualRow);
      }
    }, 500);
  });
}

function showReadingStats(doc: Document, service: ReadingService): void {
  const overlay = doc.body.createDiv({
    cls: "dashboard-pomodoro-stats-overlay",
  });
  const modal = overlay.createDiv({ cls: "dashboard-pomodoro-stats-modal" });

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  doc.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const header = modal.createDiv({ cls: "dashboard-pomodoro-stats-header" });
  header.createDiv({
    cls: "dashboard-pomodoro-stats-header-title",
    text: t("reading.statsTitle"),
  });
  const closeBtn = header.createDiv({ cls: "dashboard-pomodoro-stats-close" });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", close);

  const content = modal.createDiv({ cls: "dashboard-reading-stats-content" });

  function renderContent(): void {
    content.empty();

    // Summary card
    const summaryCard = content.createDiv({
      cls: "dashboard-reading-stats-card",
    });
    const summaryGrid = summaryCard.createDiv({
      cls: "dashboard-reading-stats-summary",
    });
    const totalItem = summaryGrid.createDiv({
      cls: "dashboard-reading-stats-summary-item",
    });
    totalItem.createDiv({
      cls: "dashboard-reading-stats-summary-value",
      text: formatReadingDuration(service.getTotalSeconds()),
    });
    totalItem.createDiv({
      cls: "dashboard-reading-stats-summary-label",
      text: t("reading.totalReading"),
    });
    const todayItem = summaryGrid.createDiv({
      cls: "dashboard-reading-stats-summary-item",
    });
    todayItem.createDiv({
      cls: "dashboard-reading-stats-summary-value",
      text: formatReadingDuration(service.getTodaySeconds()),
    });
    todayItem.createDiv({
      cls: "dashboard-reading-stats-summary-label",
      text: t("reading.todayReading"),
    });
    const bookItem = summaryGrid.createDiv({
      cls: "dashboard-reading-stats-summary-item",
    });
    bookItem.createDiv({
      cls: "dashboard-reading-stats-summary-value",
      text: String(service.getBookCountInRange(365)),
    });
    bookItem.createDiv({
      cls: "dashboard-reading-stats-summary-label",
      text: t("reading.bookCount"),
    });
    const streakItem = summaryGrid.createDiv({
      cls: "dashboard-reading-stats-summary-item",
    });
    streakItem.createDiv({
      cls: "dashboard-reading-stats-summary-value",
      text: String(service.getStreak()),
    });
    streakItem.createDiv({
      cls: "dashboard-reading-stats-summary-label",
      text: t("reading.streakDays"),
    });

    // Book list card
    const bookCard = content.createDiv({ cls: "dashboard-reading-stats-card" });
    bookCard.createDiv({
      cls: "dashboard-reading-stats-card-title",
      text: t("reading.bookList"),
    });
    const rangeToggle = bookCard.createDiv({
      cls: "dashboard-reading-stats-range",
    });
    const ranges: { key: string; label: string; days: number }[] = [
      { key: "week", label: t("reading.rangeWeek"), days: 7 },
      { key: "month", label: t("reading.rangeMonth"), days: 30 },
      { key: "year", label: t("reading.rangeYear"), days: 365 },
    ];
    let activeRange = "month";
    const toggleButtons = ranges.map((r) =>
      rangeToggle.createDiv({
        cls:
          "dashboard-reading-stats-range-btn" +
          (r.key === activeRange
            ? " dashboard-reading-stats-range-btn--active"
            : ""),
        text: r.label,
      }),
    );
    const bookListContainer = bookCard.createDiv({
      cls: "dashboard-reading-book-list",
    });

    function renderBookList(rangeKey: string): void {
      bookListContainer.empty();
      const rangeInfo = ranges.find((r) => r.key === rangeKey);
      if (!rangeInfo) return;
      const books = service.getBookBreakdownInRange(rangeInfo.days);
      if (books.length === 0) {
        bookListContainer.createDiv({
          cls: "dashboard-reading-stats-empty",
          text: t("reading.noRecords"),
        });
        return;
      }
      for (const book of books) {
        const row = bookListContainer.createDiv({
          cls: "dashboard-reading-book-list-row",
        });
        if (book.coverUrl) {
          const c = row.createDiv({ cls: "dashboard-reading-book-list-cover" });
          downloadCoverAsBlobUrl(book.coverUrl).then((url) => {
            if (url) c.style.backgroundImage = `url(${url})`;
          });
        } else {
          row.createDiv({ cls: "dashboard-reading-book-list-nocover" });
        }
        const info = row.createDiv({ cls: "dashboard-reading-book-list-info" });
        info.createDiv({
          cls: "dashboard-reading-book-list-title",
          text: book.title,
        });
        if (book.author)
          info.createDiv({
            cls: "dashboard-reading-book-list-author",
            text: book.author,
          });
        const meta = row.createDiv({ cls: "dashboard-reading-book-list-meta" });
        meta.createDiv({
          cls: "dashboard-reading-book-list-duration",
          text: formatReadingDuration(book.totalSeconds),
        });
        meta.createDiv({
          cls: "dashboard-reading-book-list-sessions",
          text: t("reading.times", { count: book.sessions }),
        });
        const del = meta.createDiv({
          cls: "dashboard-reading-stats-record-del",
        });
        setIcon(del, "trash-2");
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          await service.deleteBookRecords(book.title);
          renderBookList(rangeKey);
        });
      }
    }
    toggleButtons.forEach((btn, i) => {
      btn.addEventListener("click", () => {
        activeRange = ranges[i]!.key;
        toggleButtons.forEach((b, j) =>
          b.toggleClass("dashboard-reading-stats-range-btn--active", j === i),
        );
        renderBookList(activeRange);
      });
    });
    renderBookList(activeRange);

    // Recent records card
    const recentRecords = service.getRecentRecords(10);
    if (recentRecords.length > 0) {
      const recentCard = content.createDiv({
        cls: "dashboard-reading-stats-card",
      });
      recentCard.createDiv({
        cls: "dashboard-reading-stats-card-title",
        text: t("reading.recentRecords"),
      });
      for (const rec of recentRecords) {
        const row = recentCard.createDiv({
          cls: "dashboard-reading-stats-record",
        });
        const ts = new Date(rec.timestamp);
        const dateText = `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`;
        row.createDiv({
          cls: "dashboard-reading-stats-record-date",
          text: dateText,
        });
        row.createDiv({
          cls: "dashboard-reading-stats-record-book",
          text: rec.bookTitle,
        });
        row.createDiv({
          cls: "dashboard-reading-stats-record-dur",
          text: formatReadingDuration(rec.durationSeconds),
        });
        const del = row.createDiv({
          cls: "dashboard-reading-stats-record-del",
        });
        setIcon(del, "trash-2");
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          await service.deleteRecord(rec.timestamp);
          renderContent();
        });
      }
    }
  }

  renderContent();
}

export async function renderDashboard(
  container: HTMLElement,
  data: DashboardData,
  callbacks: RenderCallbacks,
  app: App,
  settings?: DashboardSettings,
): Promise<void> {
  container.empty();
  container.addClass("dashboard-kanban");

  // `renderSection` is async (v1.4.6 introduced an async auto-
  // archive filter for todo / todoplus cards). We render columns
  // sequentially because the section-building is itself synchronous
  // — only the per-card isCardAllCompleted check awaits — so the
  // DOM mutations are interleaved and a long TodoPlus chain can't
  // stall the visible UI for a noticeable beat.
  for (const column of data.columns) {
    const section = await renderSection(column, callbacks, app, data, settings);
    container.appendChild(section);
  }

  const addColBtn = container.createDiv({ cls: "dashboard-add-section" });
  addColBtn.setText(t("renderer.addSection"));
  addColBtn.setAttribute("role", "button");
  addColBtn.addEventListener("click", () => {
    if (addColBtn.querySelector("input")) return;
    addColBtn.empty();

    let selectedType = "projects";

    const row = addColBtn.createDiv({ cls: "dashboard-add-section-row" });

    const input = row.createEl("input", {
      cls: "dashboard-task-input",
      attr: { type: "text", placeholder: t("renderer.sectionName") },
    });

    const typePicker = row.createDiv({ cls: "dashboard-section-type-picker" });
    const typeOptions = [
      { value: "projects", label: t("renderer.typeNotes") },
      { value: "todo", label: t("renderer.typeTodo") },
      { value: "todoplus", label: t("renderer.typeTodoPlus") },
      { value: "memo", label: t("renderer.typeMemo") },
      { value: "library", label: t("renderer.typeLibrary") },
    ];

    for (const opt of typeOptions) {
      const btn = typePicker.createEl("button", {
        cls:
          "dashboard-section-type-btn" +
          (opt.value === selectedType ? " active" : ""),
        text: opt.label,
        attr: { "data-type": opt.value },
      });
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedType = opt.value;
        typePicker
          .querySelectorAll(".dashboard-section-type-btn")
          .forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    }

    const confirmBtn = row.createEl("button", {
      cls: "dashboard-section-confirm-btn",
      attr: { "aria-label": t("common.save") },
    });
    setIcon(confirmBtn, "check");
    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    });

    const finish = () => {
      const name = input.value.trim();
      input.value = "";
      if (name) {
        callbacks.onColumnAdd(name, selectedType);
      }
      addColBtn.empty();
      addColBtn.setText(t("renderer.addSection"));
    };

    input.addEventListener("input", () => {
      const name = input.value.trim().toLowerCase();
      if (name === "memo") {
        selectedType = "memo";
      } else if (name === "todo") {
        selectedType = "todo";
      } else {
        return;
      }
      typePicker
        .querySelectorAll(".dashboard-section-type-btn")
        .forEach((b) => {
          b.toggleClass("active", b.getAttribute("data-type") === selectedType);
        });
    });

    input.addEventListener("keydown", (ke: KeyboardEvent) => {
      if (ke.key === "Enter") {
        ke.preventDefault();
        finish();
      } else if (ke.key === "Escape") {
        ke.preventDefault();
        addColBtn.empty();
        addColBtn.setText(t("renderer.addSection"));
      }
    });

    input.focus();
  });
}

const COLLAPSED_KEY = "peingxious-dashboard-collapsed";

function getCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsedSections(collapsed: Set<string>): void {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
}

/** Check if a column is protected from deletion (main heading / has tags or links) */
function isColumnProtected(columnName: string, data?: DashboardData): boolean {
  if (!data) return false;
  const idx = data.columns.findIndex((c) => c.name === columnName);
  // First column (main heading) is protected
  if (idx === 0) return true;
  // Columns with wiki-links [[...]] or tags # are protected
  if (columnName.includes("[[") || columnName.includes("#")) return true;
  return false;
}

/**
 * Computes whether a card's task list is "all completed" — i.e.
 * every task is checked. Returns `false` for empty task lists so
 * a brand-new card with no tasks yet is NOT auto-archived (an
 * empty list isn't a "finished" list, it's a fresh one).
 *
 * For a regular `task` card, the source of truth is the in-memory
 * `card.tasks` array. For a `todoplus` card, the source is the
 * checklist in the linked source note under the card's heading —
 * we have to read & parse the file. This is `async` because the
 * file read may need to wait for the metadata cache to settle on
 * a fresh workspace.
 */
async function isCardAllCompleted(
  card: DashboardCard,
  app: App,
): Promise<boolean> {
  // Regular Todo card: use the in-memory task list.
  if (card.type !== "todoplus") {
    if (!card.tasks || card.tasks.length === 0) return false;
    return card.tasks.every((t) => t.checked);
  }
  // TodoPlus card: parse the source file's heading slice.
  const sourceLink = getTodoPlusSourceLinkFromTitle(card);
  if (!sourceLink) return false;
  let slice = await resolveTodoPlusSlice(app, sourceLink);
  if (!slice) {
    // Cache may not have indexed the file yet (fresh workspace).
    // Give it one more chance.
    await new Promise<void>((r) => setTimeout(r, 200));
    slice = await resolveTodoPlusSlice(app, sourceLink);
  }
  if (!slice) return false;
  if (slice.items.length === 0) return false;
  return slice.items.every((it) => it.checked);
}

async function renderSection(
  column: DashboardColumn,
  callbacks: RenderCallbacks,
  app: App,
  data?: DashboardData,
  settings?: DashboardSettings,
): Promise<HTMLElement> {
  const el = document.createElement("div");
  el.addClass("dashboard-section-row");
  el.dataset.column = column.name;
  const sectionType = getSectionType(column);
  el.dataset.sectionType = sectionType;

  const collapsed = getCollapsedSections();
  if (collapsed.has(column.name)) {
    el.addClass("dashboard-section-row--collapsed");
  }

  const header = el.createDiv({ cls: "dashboard-section-header" });

  const titleWrap = header.createDiv({ cls: "dashboard-section-title-wrap" });
  const toggle = titleWrap.createDiv({ cls: "dashboard-section-toggle" });
  toggle.setAttribute("role", "button");
  toggle.setAttribute("aria-label", "Toggle section");
  // Section name is rendered as a regular user-facing string — the
  // same way every other section name is displayed. We do NOT extract
  // a trailing number into a separate badge: a column called "library"
  // is just "library", a column called "121" is just "121", and a
  // column called "Project 5" is just "Project 5". Treating the name
  // as a label/tag would change its meaning from "name" to "id".
  const titleEl = titleWrap.createEl("h3", {
    cls: "dashboard-section-title",
  });
  renderColumnTitle(titleEl, column.name, app);

  titleEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    // When editing, present the full original column name so the user
    // can edit the whole string verbatim.
    const currentName = column.name;
    titleEl.empty();
    const input = titleEl.createEl("input", {
      cls: "dashboard-section-rename-input",
      attr: { type: "text", value: currentName },
    });
    input.focus();
    input.select();

    const finish = (save: boolean) => {
      const newName = input.value.trim();
      if (save && newName && newName !== currentName) {
        callbacks.onColumnRename(currentName, newName);
      } else {
        // Cancel path — restore the original column name verbatim.
        titleEl.empty();
        renderColumnTitle(titleEl, currentName, app);
      }
    };

    input.addEventListener("keydown", (ke: KeyboardEvent) => {
      if (ke.key === "Enter") {
        ke.preventDefault();
        finish(true);
      } else if (ke.key === "Escape") {
        ke.preventDefault();
        finish(false);
      }
    });

    input.addEventListener("blur", () => {
      finish(true);
    });
  });
  titleEl.style.cursor = "pointer";

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isNowCollapsed = el.hasClass("dashboard-section-row--collapsed");
    if (isNowCollapsed) {
      el.removeClass("dashboard-section-row--collapsed");
      collapsed.delete(column.name);
    } else {
      el.addClass("dashboard-section-row--collapsed");
      collapsed.add(column.name);
    }
    saveCollapsedSections(collapsed);
  });

  const headerActions = header.createDiv({
    cls: "dashboard-section-header-actions",
  });

  if (sectionType === "todo") {
    const templateBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: { "aria-label": t("template.addFromTemplate") },
    });
    setIcon(templateBtn, "layout-template");
    templateBtn.addEventListener("click", () =>
      callbacks.onAddFromTemplate(column.name),
    );
  }

  // Section-level "auto-archive completed cards" toggle for the
  // Todo and TodoPlus column variants. The v1.4.5 implementation
  // was a per-card "hide completed items" eye button (item-level
  // filter); v1.4.6 changed the semantic to card-level archive:
  // when ON, any card whose task list is fully checked disappears
  // from the dashboard entirely. The state is persisted in the
  // column's frontmatter via `archiveCompleted: bool` (the
  // callback `onColumnArchiveCompletedChange` writes through to
  // `SyncService.setColumnArchiveCompleted`). Default ON — when
  // the frontmatter key is absent, the column behaves as if
  // `archiveCompleted: true` is set, matching the user request
  // "默认开启". A non-task section type is ignored: the button
  // is not rendered for projects / memo / library.
  if (sectionType === "todo" || sectionType === "todoplus") {
    const columnArchive = column.archiveCompleted ?? true;
    const archiveBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn dashboard-section-archive-completed-btn",
      attr: {
        "aria-label": columnArchive
          ? t("renderer.showArchivedCards")
          : t("renderer.hideArchivedCards"),
        "aria-pressed": columnArchive ? "true" : "false",
        title: columnArchive
          ? t("renderer.showArchivedCards")
          : t("renderer.hideArchivedCards"),
      },
    });
    setIcon(archiveBtn, columnArchive ? "archive-restore" : "archive");
    if (columnArchive) {
      archiveBtn.addClass("dashboard-section-add-btn--active");
    }
    archiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onColumnArchiveCompletedChange(column.name, !columnArchive);
    });
  }

  // Library section: render differently
  if (sectionType === "library") {
    const configBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: { "aria-label": t("library.configure") },
    });
    setIcon(configBtn, "settings");
    configBtn.addEventListener("click", () => {
      const event = new CustomEvent("dashboard-library-config", {
        detail: { columnName: column.name },
        bubbles: true,
      });
      el.dispatchEvent(event);
    });

    // Delete section button for library (hidden for protected columns)
    if (!isColumnProtected(column.name, data)) {
      const deleteSectionBtn = headerActions.createEl("button", {
        cls: "dashboard-section-add-btn dashboard-section-delete-btn",
        attr: {
          "aria-label": t("renderer.deleteSection", { column: column.name }),
        },
      });
      setIcon(deleteSectionBtn, "trash-2");
      deleteSectionBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmDialog(app, {
          title: t("common.confirmDelete"),
          message: t("renderer.deleteSectionConfirm", { column: column.name }),
        });
        if (confirmed) {
          callbacks.onColumnDelete(column.name);
        }
      });
    }

    renderLibrarySection(el, column, app, (config) => {
      callbacks.onLibraryConfigChange(column.name, config);
    });
    return el;
  }

  // Section type dropdown selector (memo / todo / projects / todoplus)
  const typeOptions = [
    { value: "memo", label: t("renderer.typeMemo"), icon: "sticky-note" },
    { value: "todo", label: t("renderer.typeTodo"), icon: "check-square" },
    {
      value: "projects",
      label: t("renderer.typeProjects"),
      icon: "folder-kanban",
    },
    {
      value: "todoplus",
      label: t("renderer.typeTodoPlus"),
      icon: "list-checks",
    },
  ];
  const currentType =
    sectionType === "notes"
      ? "projects"
      : sectionType === "dashboard"
        ? "projects"
        : sectionType;
  const currentTypeObj =
    typeOptions.find((o) => o.value === currentType) || typeOptions[2]!;

  const typeBtnWrapper = headerActions.createDiv({
    cls: "dashboard-section-type-wrapper",
  });
  const typeToggleBtn = typeBtnWrapper.createEl("button", {
    cls: "dashboard-section-add-btn dashboard-section-type-btn",
    attr: { "aria-label": t("renderer.switchSectionType") },
  });
  setIcon(typeToggleBtn, currentTypeObj.icon as any);

  // Dropdown menu
  const typeDropdown = typeBtnWrapper.createDiv({
    cls: "dashboard-section-type-dropdown",
  });
  typeDropdown.style.display = "none";
  typeOptions.forEach((opt) => {
    const item = typeDropdown.createDiv({
      cls: "dashboard-section-type-dropdown-item",
    });
    if (opt.value === currentType) item.addClass("active");
    const iconSpan = item.createSpan({
      cls: "dashboard-section-type-dropdown-icon",
    });
    setIcon(iconSpan, opt.icon as any);
    item.createSpan({ text: opt.label });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (opt.value !== currentType) {
        callbacks.onColumnSectionTypeChange(column.name, opt.value);
      }
      typeDropdown.style.display = "none";
    });
  });

  typeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = typeDropdown.style.display === "block";
    typeDropdown.style.display = isOpen ? "none" : "block";
  });

  // Close dropdown when clicking outside
  document.addEventListener(
    "click",
    () => {
      typeDropdown.style.display = "none";
    },
    { once: false },
  );

  // Add card button. The UX differs per section kind:
  //   - projects: inline text input (a free-form group label, e.g.
  //     "Q4-roadmap"). Collected and forwarded to
  //     `callbacks.onProjectGroupAdd`.
  //   - todoplus: opens the `DocSearchModal` so the user filters
  //     vault notes by name/path and picks one. The picked note
  //     becomes the source — we auto-create `## To-do` in it if
  //     missing and add a `[[note#To-do]]` mirror card. We no
  //     longer require the user to type a wikilink-form string
  //     by hand.
  //   - everything else: simple click → `callbacks.onCardAdd`.
  const addCardSectionType = getSectionType(column);
  const isProjectSection = addCardSectionType === "projects";
  const isTodoPlusSection = addCardSectionType === "todoplus";
  if (isTodoPlusSection) {
    // Note-search UX. We piggy-back on the existing project
    // `DocSearchModal` (substring filter over vault file
    // basenames / paths; max 20 hits) — the user types to
    // narrow the candidate set, then clicks the result they
    // want. The picked `TFile` is the mirror target.
    const addCardBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: { "aria-label": t("renderer.addCardTo", { column: column.name }) },
    });
    setIcon(addCardBtn, "plus");
    addCardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTodoPlusNoteSearchModal(column, callbacks, app);
    });
  } else if (isProjectSection) {
    let addInputVisible = false;
    let addInputEl: HTMLInputElement | null = null;

    const addCardBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: { "aria-label": t("renderer.addCardTo", { column: column.name }) },
    });
    setIcon(addCardBtn, "plus");
    addCardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (addInputVisible && addInputEl) {
        addInputEl.focus();
        return;
      }
      addInputVisible = true;
      // Remove existing input if any
      const existing = addCardBtn.parentElement!.querySelector(
        ".dashboard-section-add-input",
      );
      if (existing) existing.remove();

      const wrapper = addCardBtn.parentElement!.createDiv({
        cls: "dashboard-section-add-input",
      });
      addInputEl = wrapper.createEl("input", {
        cls: "dashboard-task-input",
        attr: {
          type: "text",
          placeholder: t("renderer.addGroup"),
        },
      });
      addInputEl.focus();

      const finishAdd = () => {
        const val = addInputEl?.value.trim();
        if (val) {
          callbacks.onProjectGroupAdd(column.name, val);
        }
        wrapper.remove();
        addInputVisible = false;
        addInputEl = null;
      };

      addInputEl.addEventListener("keydown", (ke: KeyboardEvent) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          finishAdd();
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          wrapper.remove();
          addInputVisible = false;
          addInputEl = null;
        }
      });
      addInputEl.addEventListener("blur", () => {
        setTimeout(finishAdd, 100);
      });
    });
  } else {
    const addCardBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: { "aria-label": t("renderer.addCardTo", { column: column.name }) },
    });
    setIcon(addCardBtn, "plus");
    addCardBtn.addEventListener("click", () =>
      callbacks.onCardAdd(column.name),
    );
  }

  // Delete section button (hidden for protected columns)
  if (!isColumnProtected(column.name, data)) {
    const deleteSectionBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn dashboard-section-delete-btn",
      attr: {
        "aria-label": t("renderer.deleteSection", { column: column.name }),
      },
    });
    setIcon(deleteSectionBtn, "trash-2");
    deleteSectionBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirmDialog(app, {
        title: t("common.confirmDelete"),
        message: t("renderer.deleteSectionConfirm", { column: column.name }),
      });
      if (confirmed) {
        callbacks.onColumnDelete(column.name);
      }
    });
  }

  const cardsContainer = el.createDiv({ cls: "dashboard-section-cards" });

  // v1.4.6 auto-archive filter: for todo / todoplus columns with
  // the section-level archive toggle enabled (default true), drop
  // any card whose task list is fully checked. The check is async
  // for todoplus cards (we have to read the source file) and sync
  // for regular task cards.
  const archiveEnabled =
    (sectionType === "todo" || sectionType === "todoplus") &&
    (column.archiveCompleted ?? true);

  for (const card of column.cards) {
    try {
      if (archiveEnabled) {
        const allDone = await isCardAllCompleted(card, app);
        if (allDone) {
          // Skip rendering — the card is "archived". The card is
          // NOT deleted from `column.cards` in the underlying
          // data; this filter is a render-time concern only, so
          // the user can flip the archive button back off and
          // see the card again.
          continue;
        }
      }
      const cardEl = renderCard(
        card,
        column.name,
        sectionType,
        callbacks,
        app,
        data,
        settings,
      );
      cardsContainer.appendChild(cardEl);
    } catch (err) {
      console.error("[Dashboard] renderCard error:", card.id, card.type, err);
    }
  }

  // When ALL cards in the column are archived, show a small
  // placeholder so the user has feedback that the section isn't
  // empty by accident — the placeholder is muted and a single
  // line, no button or interaction. The user can flip the archive
  // button in the header to see the cards again.
  if (archiveEnabled && cardsContainer.children.length === 0) {
    const archivedAll = cardsContainer.createDiv({
      cls: "dashboard-section-archived-empty",
    });
    archivedAll.setText(t("renderer.allCardsArchived"));
  }

  return el;
}

function renderCard(
  card: DashboardCard,
  columnName: string,
  sectionType: string,
  callbacks: RenderCallbacks,
  app: App,
  data?: DashboardData,
  settings?: DashboardSettings,
): HTMLElement {
  // Effective "hide completed" state for this render pass:
  //   1. The card's own in-memory override (set by the eye/eye-off
  //      button) wins when it is set — this is the session-only
  //      item-level toggle.
  //   2. Otherwise fall back to the global `defaultHideCompleted`
  //      setting (default true) so users see a clean list out of
  //      the box.
  // The `card.hideCompleted` flag itself is never persisted to the
  // dashboard markdown (see parser.ts), so on every reload the
  // field is "unset" and step 2 applies — that's what makes the
  // toggle session-only by construction.
  // (The v1.4.5 column-level `columnHideCompleted` was removed in
  //  v1.4.6: the section-level button is now an "archive completed
  //  cards" toggle, not an item-level filter override.)
  const defaultHide = settings?.defaultHideCompleted ?? true;
  const hideCompletedResolved = card.hideCompleted ?? defaultHide;

  const el = document.createElement("div");
  el.addClass("dashboard-card", `dashboard-card--${card.type}`);
  el.dataset.cardId = card.id;
  el.dataset.cardType = card.type;
  el.setAttribute("role", "article");
  el.setAttribute("aria-label", card.title);
  el.setAttribute("draggable", "true");

  if (card.color) {
    el.dataset.hasColor = "true";
    el.style.setProperty("--db-card-accent", card.color);
  }

  const isMemo = sectionType === "memo";
  // Treat TodoPlus cards the same as plain Todo cards for header
  // chrome (eye button, no edit pencil, project-like layout rules)
  // — the user asked for visual parity with the regular Todo
  // section, and that's the cheapest way to get it without forking
  // the card-header logic.
  const isTask =
    card.type === "task" ||
    sectionType === "todo" ||
    sectionType === "todoplus";
  const isWeather = card.type === "weather";
  const isTracker = card.type === "tracker";
  const isWidget = isWeather || isTracker;
  const isProjectLike = !isMemo && !isTask && !isWidget;
  const isDashboardSection = sectionType === "dashboard";

  // Projects: top accent line instead of cover image
  if (isProjectLike && !isDashboardSection && sectionType !== "notes") {
    const accentLine = el.createDiv({ cls: "dashboard-project-accent-line" });
    if (card.color) {
      accentLine.style.backgroundColor = card.color;
    }
  }

  const header = el.createDiv({ cls: "dashboard-card-header" });

  // Mobile: tap header to toggle card action buttons
  header.addEventListener(
    "touchstart",
    () => {
      const wasActive = header.hasClass("dashboard-card-header--touched");
      document
        .querySelectorAll(".dashboard-card-header--touched")
        .forEach((el) => {
          el.removeClass("dashboard-card-header--touched");
        });
      if (!wasActive) {
        header.addClass("dashboard-card-header--touched");
      }
    },
    { passive: true },
  );

  const titleEl = header.createEl("h4", { cls: "dashboard-card-title" });
  try {
    renderTextWithLinks(titleEl, card.title, app);
    if (
      titleEl.querySelector(".dashboard-wikilink, .dashboard-external-link")
    ) {
      titleEl.addClass("dashboard-card-title--linked");
    }
  } catch (err) {
    console.error(
      "[peingxious-dashboard] title renderTextWithLinks FAILED:",
      err,
    );
    titleEl.setText(card.title);
  }

  const skipEditBtn = isMemo || isTask || (isWidget && isDashboardSection);

  titleEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const originalTitle = card.title;
    const currentTitle = titleEl.getText();
    titleEl.empty();
    const input = titleEl.createEl("input", {
      cls: "dashboard-title-edit-input",
      attr: { type: "text", value: originalTitle },
    });
    input.focus();
    input.select();

    const finish = (save: boolean) => {
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== originalTitle) {
        callbacks.onCardTitleEdit(card.id, newTitle);
      } else {
        titleEl.empty();
        try {
          renderTextWithLinks(titleEl, originalTitle, app);
        } catch {
          titleEl.setText(originalTitle);
        }
      }
    };

    input.addEventListener("keydown", (ke: KeyboardEvent) => {
      if (ke.key === "Enter") {
        ke.preventDefault();
        finish(true);
      } else if (ke.key === "Escape") {
        ke.preventDefault();
        finish(false);
      }
    });

    input.addEventListener("blur", () => {
      finish(true);
    });
  });
  titleEl.style.cursor = "pointer";

  const actions = header.createDiv({ cls: "dashboard-card-actions" });

  // Dashboard grid layout for widget cards
  if (isWidget && isDashboardSection) {
    const currentSize: CardSize = card.size || "M";
    const sizeToGrid: Record<CardSize, { cols: number; rows: number }> = {
      S: { cols: 1, rows: 1 },
      M: { cols: 2, rows: 1 },
      L: { cols: 2, rows: 2 },
    };
    const grid = sizeToGrid[currentSize];
    el.style.gridColumn = `span ${grid.cols}`;
    el.style.gridRow = `span ${grid.rows}`;

    // Size selector button for dashboard widgets only
    const sizeBtn = actions.createEl("button", {
      cls: "dashboard-card-btn dashboard-card-btn--size",
      attr: { "aria-label": "Card size" },
    });
    sizeBtn.setText(t("widget.size" + currentSize));
    sizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sizes: CardSize[] = ["S", "M", "L"];
      const nextIdx = (sizes.indexOf(currentSize) + 1) % sizes.length;
      const nextSize = sizes[nextIdx]!;
      callbacks.onCardSizeChange(card.id, nextSize);
    });
  }

  // Memo cards no longer expose a color picker (per user request).
  // Widgets (weather / tracker) still need color for accent.
  if (isWidget) {
    const colorBtn = actions.createEl("button", {
      cls: "dashboard-card-btn dashboard-card-btn--color",
      attr: { "aria-label": t("renderer.setMemoColor") },
    });
    setIcon(colorBtn, "palette");
    if (card.color) {
      colorBtn.style.color = card.color;
    }
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "color";
      input.value = card.color || "#f59e0b";
      input.style.position = "absolute";
      input.style.opacity = "0";
      input.style.width = "0";
      input.style.height = "0";
      document.body.appendChild(input);
      input.addEventListener("input", () => {
        callbacks.onMemoColorChange(card, input.value);
      });
      input.addEventListener("change", () => {
        if (input.value) {
          callbacks.onMemoColorChange(card, input.value);
        }
        input.remove();
      });
      input.addEventListener("blur", () => {
        input.remove();
      });
      input.click();
    });
  }

  if (!skipEditBtn) {
    const editBtn = actions.createEl("button", {
      cls: "dashboard-card-btn",
      attr: { "aria-label": t("renderer.editCard") },
    });
    setIcon(editBtn, "pencil");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onCardEdit(card);
    });
  }

  // Task/todo cards: toggle button to hide completed items from the list.
  // Persisted via onTaskHideCompletedChange (writes the card.hideCompleted flag
  // back to disk). Icon flips between "eye-off" (active — hiding) and "eye"
  // (inactive — showing everything) so the user always knows the current state.
  if (isTask) {
    // Use the resolved (settings + in-memory override) value so the
    // button reflects what the user actually sees right now, even
    // before the user has touched it (i.e. the default kicks in).
    const hideCompleted = hideCompletedResolved;
    const hideBtn = actions.createEl("button", {
      cls: "dashboard-card-btn",
      attr: {
        "aria-label": hideCompleted
          ? t("renderer.showCompletedTasks")
          : t("renderer.hideCompletedTasks"),
        "aria-pressed": hideCompleted ? "true" : "false",
        title: hideCompleted
          ? t("renderer.showCompletedTasks")
          : t("renderer.hideCompletedTasks"),
      },
    });
    setIcon(hideBtn, hideCompleted ? "eye-off" : "eye");
    if (hideCompleted) {
      hideBtn.addClass("dashboard-card-btn--active");
    }
    hideBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onTaskHideCompletedChange(card.id, !hideCompleted);
    });
  }

  const deleteBtn = actions.createEl("button", {
    cls: "dashboard-card-btn dashboard-card-btn--danger",
    attr: { "aria-label": t("renderer.deleteCard") },
  });
  setIcon(deleteBtn, "trash-2");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onCardDelete(card.id);
  });

  const body = el.createDiv({ cls: "dashboard-card-body" });

  renderCardBody(
    body,
    card,
    columnName,
    sectionType,
    callbacks,
    app,
    data,
    settings,
  );

  if (isProjectLike) {
    body.addEventListener("dragover", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          ".dashboard-project-item, .dashboard-task-item, .dashboard-project-list, .dashboard-task-list",
        )
      )
        return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = projectItemDragSource ? "move" : "copy";
      }
      body.addClass("dashboard-card-body--doc-drop");
    });

    body.addEventListener("dragleave", (e) => {
      if (!body.contains(e.relatedTarget as Node)) {
        body.removeClass("dashboard-card-body--doc-drop");
      }
    });

    body.addEventListener("drop", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          ".dashboard-project-item, .dashboard-task-item, .dashboard-project-list, .dashboard-task-list",
        )
      )
        return;
      e.preventDefault();
      body.removeClass("dashboard-card-body--doc-drop");

      // Project item cross-card move (onto card body directly)
      if (projectItemDragSource) {
        if (projectItemDragSource.cardId === card.id) return;
        e.stopPropagation();
        const numItems = card.body
          ? card.body
              .split("\n")
              .filter(
                (l) => l.trim() && (l.match(/^(\t*)/)?.[1]?.length ?? 0) === 0,
              ).length
          : 0;
        callbacks.onProjectItemMoveToCard(
          projectItemDragSource.cardId,
          projectItemDragSource.itemIndex,
          card.id,
          numItems,
        );
        return;
      }

      const raw = e.dataTransfer?.getData("text/plain");
      if (!raw) return;
      const filePath = raw.trim();
      if (filePath) {
        callbacks.onFileDrop(card.id, filePath);
      }
    });
  }

  if (card.dueDate) {
    const due = el.createDiv({ cls: "dashboard-card-due" });
    due.createSpan({ text: card.dueDate });
  }

  if (isMemo) {
    if (card.width > 0) {
      const w = Math.max(200, Math.min(600, card.width));
      el.style.flex = `0 0 ${w}px`;
      el.style.minWidth = `${w}px`;
      el.style.maxWidth = `${w}px`;
    }
  }

  // Dashboard grid layout for widget cards (styles only, button already created above)
  if (isWidget && isDashboardSection) {
    // grid styles already set above when creating the size button
  } else if (isMemo || isTask || isProjectLike) {
    const minW = 200;
    const maxW = 600;
    if (!isMemo && card.width > 0) {
      const w = Math.max(minW, Math.min(500, card.width));
      el.style.flex = `0 0 ${w}px`;
      el.style.minWidth = `${w}px`;
      el.style.maxWidth = `${w}px`;
    }
    const handle = el.createDiv({ cls: "dashboard-card-resize-handle" });
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = el.offsetWidth;
      el.addClass("dashboard-card--resizing");

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
        el.style.flex = `0 0 ${newWidth}px`;
        el.style.minWidth = `${newWidth}px`;
        el.style.maxWidth = `${newWidth}px`;
      };

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        el.removeClass("dashboard-card--resizing");
        const finalWidth = Math.max(
          minW,
          Math.min(maxW, startWidth + (ev.clientX - startX)),
        );
        if (finalWidth !== card.width) {
          callbacks.onCardWidthChange(card.id, finalWidth);
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  return el;
}

function renderCardBody(
  container: HTMLElement,
  card: DashboardCard,
  columnName: string,
  sectionType: string,
  callbacks: RenderCallbacks,
  app: App,
  data?: DashboardData,
  settings?: DashboardSettings,
): void {
  // Mirrors the `defaultHide` / `hideCompletedResolved` computation in
  // `renderCard` — both functions need the resolved value because the
  // eye button and the task list filter both live here, and they have
  // to agree on the same effective state for the same card. The
  // v1.4.5 column-level override was removed in v1.4.6 (the section
  // toggle is now an "archive completed cards" semantic, not an
  // item-level filter override).
  const defaultHide = settings?.defaultHideCompleted ?? true;
  const hideCompletedResolved = card.hideCompleted ?? defaultHide;
  void data; // unused here; kept for symmetry with the rest of the
  // render pipeline.

  if (card.type === "weather") {
    renderWeatherBody(container, card, app);
    return;
  }

  if (card.type === "tracker") {
    renderTrackerBody(container, card, app, settings);
    return;
  }

  // TodoPlus cards are list-style bodies (like `task`), but the list
  // lives in another note under a specific `## heading` — see
  // `renderTodoPlusBody` for the full read/sync pipeline.
  if (card.type === "todoplus") {
    void renderTodoPlusBody(container, card, callbacks, app, settings);
    return;
  }

  const isMemo = sectionType === "memo";
  const isTaskCard =
    card.type === "task" ||
    sectionType === "todo" ||
    sectionType === "todoplus";

  if (isTaskCard) {
    renderTaskBody(container, card, callbacks, app, hideCompletedResolved);
    return;
  }

  if (isMemo) {
    renderMemoBody(container, card, callbacks, app);
    return;
  }

  // All non-memo, non-task cards render as project body
  renderProjectBody(container, card, callbacks, app);
}

function renderTaskBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  hideCompletedResolved?: boolean,
): void {
  taskItemCallbacks = callbacks;
  ensureItemDocListeners();

  const list = container.createDiv({ cls: "dashboard-task-list" });
  list.dataset.cardId = card.id;

  // Filter hidden completed tasks. We still keep the original index
  // mapping for callbacks so uncheck/redo keeps the same checkbox
  // state; filteredOut tracks the indices we skipped so
  // onCheckboxToggle still receives the correct source index.
  //
  // `hideCompletedResolved` is the global-default + in-memory-override
  // resolution computed in `renderCardBody`. If a caller passes
  // `undefined` (e.g. a future path that doesn't go through the
  // dashboard renderer), fall back to the legacy in-memory-only
  // behaviour so we never regress the old API surface.
  const hideCompleted = hideCompletedResolved ?? card.hideCompleted === true;
  const visibleTasks = hideCompleted
    ? card.tasks
        .map((t, i) => ({ task: t, index: i }))
        .filter((x) => !x.task.checked)
    : card.tasks.map((t, i) => ({ task: t, index: i }));

  visibleTasks.forEach(({ task, index }) => {
    const item = list.createDiv({ cls: "dashboard-task-item" });
    item.setAttribute("draggable", "true");
    item.dataset.taskIndex = String(index);
    item.dataset.cardId = card.id;

    // Mobile: tap to toggle action buttons visibility
    item.addEventListener(
      "touchstart",
      () => {
        const wasActive = item.hasClass("dashboard-task-item--touched");
        document
          .querySelectorAll(".dashboard-task-item--touched")
          .forEach((el) => {
            el.removeClass("dashboard-task-item--touched");
          });
        if (!wasActive) {
          item.addClass("dashboard-task-item--touched");
        }
      },
      { passive: true },
    );

    const checkbox = item.createEl("input", {
      cls: "dashboard-task-checkbox",
      attr: { type: "checkbox" },
    });
    checkbox.checked = task.checked;
    checkbox.addEventListener("change", () => {
      callbacks.onCheckboxToggle(card.id, index, checkbox.checked);
    });

    const label = item.createSpan({
      cls: task.checked
        ? "dashboard-task-text dashboard-task-text--done"
        : "dashboard-task-text",
    });
    renderTextWithLinks(label, task.text, app);
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const currentText = label.getText();
      label.empty();

      // Disable dragging on the parent item while editing
      item.setAttribute("draggable", "false");

      const textarea = label.createEl("textarea", {
        cls: "dashboard-task-edit-textarea",
        text: task.text,
      });

      // Auto-size: fit content and expand as user types
      const autoResize = () => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      };
      autoResize();

      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);

      const finish = (save: boolean) => {
        const newText = textarea.value.trim();
        if (save && newText && newText !== task.text) {
          callbacks.onTaskEdit(card.id, index, newText);
        } else {
          label.empty();
          try {
            renderTextWithLinks(label, task.text, app);
          } catch {
            label.setText(task.text);
          }
        }
        item.setAttribute("draggable", "true");
      };

      textarea.addEventListener("input", autoResize);

      textarea.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter" && !ke.shiftKey) {
          ke.preventDefault();
          finish(true);
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          finish(false);
        }
      });

      textarea.addEventListener("blur", () => {
        finish(true);
      });
    });

    const delBtn = item.createEl("button", {
      cls: "dashboard-task-delete",
      attr: { "aria-label": t("renderer.deleteTask") },
    });
    setIcon(delBtn, "x");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onTaskDelete(card.id, index);
    });

    const reminderBtn = createReminderButton(
      item,
      card.id,
      index,
      task,
      callbacks,
    );
    item.appendChild(reminderBtn);
  });

  const addRow = container.createDiv({ cls: "dashboard-task-add" });
  const input = addRow.createEl("input", {
    cls: "dashboard-task-input",
    attr: { type: "text", placeholder: t("renderer.addTask") },
  });
  const taskSuggest = attachFileSuggest(input, app, (value) => {
    // #region debug-point taskadd-onpick
    console.log("[dbg-renderer] taskadd onPick value=" + JSON.stringify(value));
    // #endregion debug-point taskadd-onpick
    // `value` is the REPLACED input content (any leading text the
    // user typed before `[[` is preserved, and the picked file's
    // basename has been written in as `[[basename]]`). Using it as
    // the task title — instead of just the file's wikilink — keeps
    // the user's prefix intact, e.g. typing "review " then picking
    // "Foo.md" produces a task of "review [[Foo]]", not just
    // "[[Foo]]" (the "don't replace my content" requirement).
    callbacks.onTaskAdd(card.id, value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && taskSuggest.tryPickSelection()) {
      // #region debug-point taskadd-enter-arrow
      console.log(
        "[dbg-renderer] taskadd Enter via arrow-pick value=" +
          JSON.stringify(input.value),
      );
      // #endregion debug-point taskadd-enter-arrow
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && input.value.trim()) {
      // #region debug-point taskadd-enter-fallback
      console.log(
        "[dbg-renderer] taskadd Enter fallback value=" +
          JSON.stringify(input.value.trim()),
      );
      // #endregion debug-point taskadd-enter-fallback
      callbacks.onTaskAdd(card.id, input.value.trim());
      input.value = "";
    }
  });

  if (card.tasks.length > 0) {
    const checkedCount = card.tasks.filter((t) => t.checked).length;
    const total = card.tasks.length;
    const percent = Math.round((checkedCount / total) * 100);

    const progressWrap = container.createDiv({ cls: "dashboard-progress" });
    const bar = progressWrap.createDiv({ cls: "dashboard-progress-bar" });
    bar.createDiv({
      cls: "dashboard-progress-fill",
      attr: { style: `width: ${percent}%` },
    });
    progressWrap.createSpan({
      cls: "dashboard-progress-text",
      text: `${percent}%`,
    });
  }
}

function stripBulletPrefix(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("- ")) return line.slice(2);
      if (line.startsWith("> - ")) return "> " + line.slice(4);
      return line;
    })
    .join("\n");
}

function addBulletPrefix(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith("> ")) return "> - " + line.slice(2);
      return "- " + line;
    })
    .join("\n");
}

function renderMemoBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
): void {
  const rawText = [card.blockquote, card.body].filter(Boolean).join("\n");
  const text = stripBulletPrefix(rawText);
  let dirty = false;

  // View mode: rendered text with clickable links
  const view = container.createDiv({ cls: "dashboard-memo-view" });
  renderMemoViewContent(view, text, app);
  view.addEventListener("click", () => {
    view.style.display = "none";
    textarea.style.display = "";
    textarea.focus();
  });

  // Edit mode: textarea (hidden by default)
  const textarea = container.createEl("textarea", {
    cls: "dashboard-memo-textarea",
    text: text,
    attr: { placeholder: t("renderer.writeThoughts") },
  });
  textarea.style.display = "none";

  attachFileSuggest(textarea, app);

  textarea.addEventListener("input", () => {
    dirty = true;
  });

  const save = () => {
    if (!dirty) return;
    dirty = false;
    const value = addBulletPrefix(textarea.value);
    const lines = value.split("\n");
    const quoteLines: string[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("> ")) {
        quoteLines.push(line.slice(2));
      } else {
        bodyLines.push(line);
      }
    }

    callbacks.onMemoUpdate(card, {
      body: bodyLines.join("\n").trim(),
      blockquote: quoteLines.join("\n"),
    });
  };

  textarea.addEventListener("blur", () => {
    save();
    // If re-render didn't happen (not dirty), switch to view manually
    if (document.body.contains(view)) {
      renderMemoViewContent(view, textarea.value, app);
      view.style.display = "";
      textarea.style.display = "none";
    }
  });
}

function renderMemoViewContent(
  container: HTMLElement,
  text: string,
  app: App,
): void {
  container.empty();
  if (!text) {
    container.addClass("dashboard-memo-view--empty");
    container.setText(t("renderer.writeThoughts"));
    return;
  }
  container.removeClass("dashboard-memo-view--empty");

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) container.createEl("br");
    const line = lines[i]!;
    if (line.startsWith("> ")) {
      const quote = container.createDiv({ cls: "dashboard-note-quote" });
      quote.setText(line.slice(2));
    } else {
      renderTextWithLinks(container, line, app);
    }
  }
}

function renderNoteBody(container: HTMLElement, card: DashboardCard): void {
  if (card.blockquote) {
    const quote = container.createDiv({ cls: "dashboard-note-quote" });
    quote.setText(card.blockquote);
  }
  if (card.body) {
    container.createDiv({ cls: "dashboard-note-body", text: card.body });
  }
}

function renderLinkBody(container: HTMLElement, card: DashboardCard): void {
  const link = container.createEl("a", {
    cls: "dashboard-link-url",
    attr: { href: card.url, target: "_blank", rel: "noopener" },
    text: card.url,
  });
  if (card.body) {
    container.createDiv({ cls: "dashboard-link-desc", text: card.body });
  }
}

function renderProjectBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
): void {
  taskItemCallbacks = callbacks;
  ensureItemDocListeners();

  // Draggable project items (todo-style):
  //   Each depth-0 line is a draggable item showing title + child count
  //   depth>=1 sub-items are hidden, counted as "+N"
  //   Items can be reordered within a card or dragged between project cards

  const list = container.createDiv({ cls: "dashboard-project-list" });
  list.dataset.cardId = card.id;

  // Build a unified lines array from either card.body (markdown) or
  // card.projectDocs (structured array). The embedded view's onProjectDocsAdd
  // writes to projectDocs, while the main workspace writes to body — we
  // need to read from both so both paths render correctly.
  const projectDocPaths: string[] | undefined = (card as any).projectDocs as
    | string[]
    | undefined;
  const projectDocObjects: { path: string; children?: string[] }[] | undefined =
    (card as any).projectDocs as
      | { path: string; children?: string[] }[]
      | undefined;
  let lines: string[] = [];
  if (card.body) {
    lines = card.body.split("\n");
  } else if (
    Array.isArray(projectDocObjects) &&
    projectDocObjects.length > 0 &&
    typeof projectDocObjects[0] === "object" &&
    projectDocObjects[0] !== null &&
    "path" in projectDocObjects[0]
  ) {
    // projectDocs is array of {path, children}
    for (const doc of projectDocObjects) {
      // The data model can carry `undefined` entries in legacy
      // states (sparse splice holes, drag pre-bounds-check code
      // paths, partial deserialization). Skip anything that isn't
      // a real object with a string `path` — crashing renderCard
      // would tear down the entire dashboard for one bad row.
      if (!doc || typeof doc !== "object") continue;
      const d = doc as { path?: unknown; children?: unknown };
      if (typeof d.path !== "string" || d.path.length === 0) continue;
      // `doc.path` may be a plain vault path (legacy, e.g.
      // "Folder/Note.md") or a value with leading text + inline
      // wikilink (new behaviour, e.g. "11[[Note]]"). For the
      // latter we must NOT wrap it in another [[...]] — doing so
      // would produce nested wikilinks and drop the leading text.
      if (d.path.includes("[[")) {
        // Already a wikilink (possibly with leading text such as
        // "11[[En3]]"). Use verbatim — going through pathToWikiLink
        // would produce nested `[[[[Note]]]]` brackets and corrupt
        // the rendered link.
        lines.push(`- ${d.path}`);
      } else if (d.path.includes("/") || d.path.toLowerCase().endsWith(".md")) {
        // Looks like a vault path → wrap as `[[basename]]`.
        lines.push(`- [[${d.path.replace(/\.md$/, "")}]]`);
      } else {
        // Plain text (e.g. "11") entered via the Enter fallback.
        // Keep it as a normal list line, no double brackets. This
        // is the fix for "输入普通文本会变成双链笔记".
        lines.push(`- ${d.path}`);
      }
      if (Array.isArray(d.children)) {
        for (const child of d.children) {
          if (typeof child !== "string") continue;
          lines.push(`\t- [[${child}]]`);
        }
      }
    }
  } else if (Array.isArray(projectDocPaths) && projectDocPaths.length > 0) {
    // projectDocs is array of plain paths
    for (const p of projectDocPaths) {
      if (typeof p !== "string") continue;
      if (p.includes("[[")) {
        lines.push(`- ${p}`);
      } else {
        lines.push(`- [[${p}]]`);
      }
    }
  }

  if (lines.length > 0) {
    // (Re-use the local `lines` variable that was already built above
    // from card.body or card.projectDocs.)

    // Collect title info and child items
    interface TitleInfo {
      cleanText: string;
      path: string;
      childCount: number;
    }
    const titles: TitleInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) continue;
      const depth = line.match(/^(\t*)/)?.[1]?.length ?? 0;
      if (depth !== 0) continue;

      let cleanText = line.replace(/^\t*/, "");
      if (cleanText.startsWith("- ")) cleanText = cleanText.slice(2);
      // Capture the raw wikilink target so the per-item delete button
      // can pass a stable identifier to the sync layer. When the body
      // line has no [[...]] link, fall back to the cleaned text.
      const pathMatch = line.match(/\[\[([^\]|]+)/);
      const path = pathMatch && pathMatch[1] ? pathMatch[1] : cleanText;
      titles.push({ cleanText, path, childCount: 0 });
    }

    // Count hidden children per depth-0 title so the +N badge stays
    // correct. The children themselves are NOT rendered inline — see
    // the comment below the delete-button handler.
    {
      let titleIdx = 0;
      let inlineCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!line.trim()) continue;
        const depth = line.match(/^(\t*)/)?.[1]?.length ?? 0;
        if (depth === 0) {
          if (titleIdx > 0 && titles[titleIdx - 1]) {
            titles[titleIdx - 1]!.childCount = inlineCount;
          }
          titleIdx++;
          inlineCount = 0;
        } else if (titleIdx > 0) {
          inlineCount++;
        }
      }
      if (titleIdx > 0 && titles[titleIdx - 1]) {
        titles[titleIdx - 1]!.childCount = inlineCount;
      }
    }

    titles.forEach((title, index) => {
      const item = list.createDiv({ cls: "dashboard-project-item" });
      item.setAttribute("draggable", "true");
      item.dataset.itemIndex = String(index);
      item.dataset.cardId = card.id;

      // Drag handle indicator
      const dragHandle = item.createSpan({
        cls: "dashboard-project-item-handle",
      });
      setIcon(dragHandle, "grip-vertical");

      // Title text with wiki links
      const titleSpan = item.createSpan({
        cls: "dashboard-project-item-title",
      });
      renderTextWithLinks(titleSpan, title.cleanText, app);

      // Child count badge (keep for drag hint)
      if (title.childCount > 0) {
        const countEl = item.createSpan({
          cls: "dashboard-project-child-count",
        });
        countEl.setText(`+${title.childCount}`);
      }

      // Delete button (visible on hover, same UX as todo tasks)
      const delBtn = item.createEl("button", {
        cls: "dashboard-project-item-delete",
        attr: { "aria-label": t("renderer.deleteTask") },
      });
      setIcon(delBtn, "x");
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Pass both the index and the wikilink path so the sync
        // layer can fall back to a text-based lookup when the
        // index doesn't resolve (which would otherwise make the
        // last item "come back" after deletion).
        callbacks.onProjectItemDelete(card.id, index, title.path);
      });

      // Child items are intentionally NOT expanded inline anymore.
      // A project item may carry dozens or hundreds of nested
      // children, and rendering them all as a visible sub-list
      // pushes the real content far down the page. The +N badge
      // next to the title is the single source of truth for the
      // hidden-child count; the user can click the title (or the
      // note itself) to drill in if they need to see the children.
      // The children array on `title` is still populated by the
      // counting loop above so that the badge value stays correct.
    });
  } // end if (lines.length > 0)

  // Add note input row (inline, with file search suggest - same style as todo's add-task)
  const addRow = container.createDiv({ cls: "dashboard-task-add" });
  const input = addRow.createEl("input", {
    cls: "dashboard-task-input",
    attr: { type: "text", placeholder: t("renderer.addNote") },
  });
  const fileSuggest = attachFileSuggest(input, app, (value, file) => {
    // #region debug-point projectdocs-onpick
    console.log(
      "[dbg-renderer] projectdocs onPick value=" +
        JSON.stringify(value) +
        " file.path=" +
        JSON.stringify(file.path),
    );
    // #endregion debug-point projectdocs-onpick
    // Use `value` (the full input text after replacement, e.g.
    // "11[[En3]]") so leading text the user typed before the
    // wikilink is preserved. Previous code used `file.path` which
    // discarded everything before the opener — "don't replace my
    // content" requirement.
    callbacks.onProjectDocsAdd(card, value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && fileSuggest.tryPickSelection()) {
      // #region debug-point projectdocs-enter-arrow
      console.log(
        "[dbg-renderer] projectdocs Enter via arrow-pick value=" +
          JSON.stringify(input.value),
      );
      // #endregion debug-point projectdocs-enter-arrow
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && input.value.trim()) {
      // #region debug-point projectdocs-enter-fallback
      console.log(
        "[dbg-renderer] projectdocs Enter fallback value=" +
          JSON.stringify(input.value.trim()),
      );
      // #endregion debug-point projectdocs-enter-fallback
      callbacks.onProjectDocsAdd(card, input.value.trim());
      input.value = "";
    }
  });
}

function renderHabitBody(container: HTMLElement, card: DashboardCard): void {
  const streakEl = container.createDiv({ cls: "dashboard-habit-streak" });
  streakEl.createSpan({ cls: "dashboard-habit-icon", text: "🔥" });
  streakEl.createSpan({
    text: t("renderer.dayStreak", { count: card.streak }),
  });

  if (card.body) {
    container.createDiv({ cls: "dashboard-habit-body", text: card.body });
  }
}

// ---------------------------------------------------------------------------
// TodoPlus (`card.type === "todoplus"`)
// ---------------------------------------------------------------------------
//
// A TodoPlus card is a **view window** onto a checklist that lives in
// some other note under a `## <heading>` block. The card stores the
// source link in its `title` field (a wikilink of the form
// `[[note#heading]]`) and reads / writes the underlying file directly
// via Obsidian's native APIs — no new persistence layer is introduced.
//
//   read:  metadataCache.getFileCache(file).headings
//            → slice vault.cachedRead(file) between the target heading
//              and the next same-or-higher level heading
//   write: vault.process(file, content => …)  — only ever touches the
//          lines inside the heading slice, never outside it, so we
//          never corrupt neighbouring sections.
//
// The card body is built fresh on every render. We do not duplicate
// the checklist onto the dashboard card, which keeps the dashboard
// markdown clean and means the source note is the single source of
// truth.
interface TodoPlusChecklistItem {
  /** Absolute byte offset of this line in the source note (0-based). */
  lineStart: number;
  /** Absolute byte offset of the end of this line (excluding newline). */
  lineEnd: number;
  /** Whether the markdown checkbox is filled (true = done). */
  checked: boolean;
  /** Checkbox label text, with leading list-marker / indent stripped. */
  text: string;
}

interface TodoPlusSlice {
  file: TFile;
  heading: string;
  /** Byte range (inclusive start, exclusive end) of the heading slice
   *  in the cached file content. */
  start: number;
  end: number;
  items: TodoPlusChecklistItem[];
}

/**
 * Renders a TodoPlus card body. The card is a view onto a checklist
 * stored under a `## <heading>` in another note — see the block
 * comment above for the overall design. The body is rebuilt on every
 * call, so callers should call this once per render pass.
 *
 * UI: deliberately identical to a regular Todo card body (checkbox
 * list + add input + progress bar). The "Source: [[…]]" header and
 * the "## heading" caption that the very first iteration of TodoPlus
 * showed are gone — the source link is metadata on the card, and
 * the only user-facing thing inside the body is the checklist. This
 * way a TodoPlus column is visually indistinguishable from a plain
 * Todo column except for the data source.
 */
async function renderTodoPlusBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  settings?: DashboardSettings,
): Promise<void> {
  // The source link is read from the card's `title` (a wikilink of
  // the form `[[note#heading]]`); there is no per-card `sourceLink`
  // field anymore — see `getTodoPlusSourceLinkFromTitle` below.
  const sourceLink = getTodoPlusSourceLinkFromTitle(card);
  if (!sourceLink) {
    // No source set yet — show a one-click hint to wire it up. (This
    // path is rare: the add-card flow validates the source link
    // before creating the card, so the placeholder only appears if
    // a TodoPlus card was somehow created with an empty source.)
    const empty = container.createDiv({ cls: "dashboard-todoplus-empty" });
    empty.setText(t("renderer.todoPlusEmpty"));
    const setBtn = empty.createEl("button", {
      cls: "dashboard-todoplus-set-btn",
      text: t("renderer.todoPlusSetSource"),
    });
    setBtn.addEventListener("click", () => {
      void promptTodoPlusSourceLink(card, callbacks, app, settings);
    });
    return;
  }

  // Resolve the source file + heading slice. We render an empty-state
  // message in the body if the link can't be resolved (broken link,
  // missing file, etc.) so the user has clear feedback.
  //
  // We may need to wait for the metadata cache to index the source
  // file (it can be empty / incomplete right after Obsidian opens the
  // file, or right after the user opens the dashboard with a brand-new
  // workspace). `resolveTodoPlusSlice` handles that internally via
  // `waitForFileCache`, so this single call should be enough.
  let slice = await resolveTodoPlusSlice(app, sourceLink);

  // Belt-and-braces fallback: if the cache truly has no `## To-do`
  // heading (maybe the user just typed the link but hasn't opened the
  // file yet), give Obsidian one more chance to catch up before we
  // report an error.
  if (!slice) {
    await new Promise<void>((r) => setTimeout(r, 400));
    slice = await resolveTodoPlusSlice(app, sourceLink);
  }
  if (!slice) {
    const err = container.createDiv({ cls: "dashboard-todoplus-error" });
    err.setText(t("renderer.todoPlusUnresolved", { link: sourceLink }));
    return;
  }

  // Same hide-completed resolution the regular Todo body uses:
  //   1. The card's in-memory `hideCompleted` override wins when set.
  //   2. Otherwise fall back to the global `defaultHideCompleted`
  //      setting (default true).
  // (The v1.4.5 column-level `columnHideCompleted` was removed in
  //  v1.4.6: the section-level button is now an "archive completed
  //  cards" toggle, not an item-level filter override.)
  const defaultHide = settings?.defaultHideCompleted ?? true;
  const hideCompleted = card.hideCompleted ?? defaultHide;
  // Always compute the progress from the full item list, not the
  // filtered one — hiding completed tasks should not change the
  // percentage the user sees.
  const visibleItems = hideCompleted
    ? slice.items.filter((it) => !it.checked)
    : slice.items;

  // Build the checklist using the **same DOM classes** as
  // `renderTaskBody` so the CSS, the drag-handle expectations, and
  // any future shared styles Just Work. The only divergence is that
  // TodoPlus items aren't `draggable` (reordering would mean
  // rewriting the source file mid-drag, which the user didn't ask
  // for, so we leave that as a follow-up if needed).
  const list = container.createDiv({ cls: "dashboard-task-list" });
  list.dataset.cardId = card.id;
  list.dataset.todoplus = "true";
  list.dataset.todoplusFile = slice.file.path;
  list.dataset.todoplusHeading = slice.heading;

  if (visibleItems.length === 0) {
    const empty = list.createDiv({ cls: "dashboard-task-empty" });
    empty.setText(t("renderer.todoPlusNoItems"));
  } else {
    visibleItems.forEach((item, idx) => {
      renderTodoPlusItem(list, card, slice, item, idx, app);
    });
  }

  // Add-row: identical input UX to a regular Todo card. Pressing
  // Enter (or picking from the file-suggest dropdown) writes
  // `- [ ] <text>` to the end of the heading slice in the source
  // file via `addTodoPlusItem`. The metadataCache `changed` event
  // fires, our `scheduleTodoPlusRefresh` listener catches it, and
  // the new item appears in the list — no extra refresh wiring.
  const addRow = container.createDiv({ cls: "dashboard-task-add" });
  const input = addRow.createEl("input", {
    cls: "dashboard-task-input",
    attr: { type: "text", placeholder: t("renderer.addTask") },
  });
  const submitNew = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    void addTodoPlusItem(app, slice.file, slice.heading, value).catch((e) => {
      console.error("[apex-dashboard] TodoPlus add failed", e);
      new Notice(
        t("renderer.todoPlusWriteError", { message: (e as Error).message }),
      );
    });
  };
  const taskSuggest = attachFileSuggest(input, app, (value) => {
    // `value` here is the REPLACED input content (any leading
    // prefix the user typed before `[[` is preserved, and the
    // picked file's basename has been written in as `[[basename]]`).
    // Mirrors the regular Todo behaviour: keep the user's prefix
    // intact rather than collapsing the row to just the wikilink.
    submitNew(value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    // If the suggest popup has an active selection, Enter means
    // "pick it", not "submit my current text". The handle takes
    // care of the side effects (writing the wikilink into the
    // input + calling the onPick callback above), so we just
    // suppress the default submit.
    if (e.key === "Enter" && taskSuggest.tryPickSelection()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      submitNew(input.value);
      input.value = "";
    }
  });

  // Progress bar: same DOM as `renderTaskBody`, computed from the
  // full item list (not the filtered one) so hiding completed tasks
  // doesn't move the percentage.
  if (slice.items.length > 0) {
    const checkedCount = slice.items.filter((it) => it.checked).length;
    const total = slice.items.length;
    const percent = Math.round((checkedCount / total) * 100);

    const progressWrap = container.createDiv({ cls: "dashboard-progress" });
    const bar = progressWrap.createDiv({ cls: "dashboard-progress-bar" });
    bar.createDiv({
      cls: "dashboard-progress-fill",
      attr: { style: `width: ${percent}%` },
    });
    progressWrap.createSpan({
      cls: "dashboard-progress-text",
      text: `${percent}%`,
    });
  }

  // Reactive refresh: when the source file changes (user adds a task
  // in dash002, toggles a checkbox, renames the heading, etc.),
  // re-render this card's body. We register a `metadataCache.on(
  // "changed")` listener scoped to the source file and tear it down
  // automatically when the card leaves the DOM (via MutationObserver
  // on its parent). This keeps the dashboard in sync with the
  // source note in real time, no reload required.
  scheduleTodoPlusRefresh(app, list, card, callbacks, settings);
  return;
}

/**
 * Renders a single TodoPlus checklist item. The DOM mirrors a
 * regular Todo item (`.dashboard-task-item` + checkbox + text +
 * delete button) so the styling, the hover-revealed delete, and
 * any future task-list styles apply uniformly.
 *
 * The three user actions (toggle, edit, delete) all write back to
 * the source file via the `*TodoPlusItem` helpers — there is no
 * in-memory copy of the checklist on the dashboard card. The
 * `metadataCache.on("changed")` listener scheduled by
 * `renderTodoPlusBody` will fire after the write and re-render the
 * card body, so the user sees the new state without any extra
 * wiring here.
 */
function renderTodoPlusItem(
  list: HTMLElement,
  card: DashboardCard,
  slice: TodoPlusSlice,
  item: TodoPlusChecklistItem,
  _idx: number,
  app: App,
): void {
  const li = list.createDiv({ cls: "dashboard-task-item" });
  // Intentionally NOT `draggable="true"` — reordering would mean
  // rewriting the source file mid-drag, and the user did not ask
  // for that. Add later if requested.
  li.dataset.todoplusItem = "true";

  const checkbox = li.createEl("input", {
    cls: "dashboard-task-checkbox",
    attr: { type: "checkbox" },
  });
  checkbox.checked = item.checked;
  checkbox.addEventListener("change", () => {
    const newChecked = checkbox.checked;
    void setTodoPlusItemChecked(app, slice.file, item, newChecked).catch(
      (e) => {
        console.error("[apex-dashboard] TodoPlus toggle failed", e);
        new Notice(
          t("renderer.todoPlusWriteError", { message: (e as Error).message }),
        );
      },
    );
  });

  const label = li.createSpan({
    cls: item.checked
      ? "dashboard-task-text dashboard-task-text--done"
      : "dashboard-task-text",
  });
  renderTextWithLinks(label, item.text, app);
  label.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    label.empty();

    const textarea = label.createEl("textarea", {
      cls: "dashboard-task-edit-textarea",
      text: item.text,
    });

    // Auto-size: fit content and expand as the user types.
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    };
    autoResize();

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const finish = (save: boolean) => {
      const newText = textarea.value.trim();
      if (save && newText && newText !== item.text) {
        void editTodoPlusItem(app, slice.file, item, newText).catch((err) => {
          console.error("[apex-dashboard] TodoPlus edit failed", err);
          new Notice(
            t("renderer.todoPlusWriteError", {
              message: (err as Error).message,
            }),
          );
        });
      } else {
        label.empty();
        try {
          renderTextWithLinks(label, item.text, app);
        } catch {
          label.setText(item.text);
        }
      }
    };

    textarea.addEventListener("input", autoResize);
    textarea.addEventListener("keydown", (ke) => {
      if (ke.key === "Enter" && !ke.shiftKey) {
        ke.preventDefault();
        finish(true);
      } else if (ke.key === "Escape") {
        ke.preventDefault();
        finish(false);
      }
    });
    textarea.addEventListener("blur", () => {
      finish(true);
    });
  });

  const delBtn = li.createEl("button", {
    cls: "dashboard-task-delete",
    attr: { "aria-label": t("renderer.deleteTask") },
  });
  setIcon(delBtn, "x");
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void removeTodoPlusItem(app, slice.file, item).catch((err) => {
      console.error("[apex-dashboard] TodoPlus delete failed", err);
      new Notice(
        t("renderer.todoPlusWriteError", { message: (err as Error).message }),
      );
    });
  });
}

/**
 * Parses `card.sourceLink` and returns the matching checklist slice
 * (file + heading + parsed items). Returns `null` when the file or
 * heading can't be resolved, or when the source link is malformed.
 *
 * Note: this is an **async** function because `getFirstLinkpathDest`
 * can resolve links that haven't been seen yet, but for files that
 * have been observed we read the cache synchronously. The
 * `metadataCache.on("resolve")` event isn't necessary here — we just
 * call into Obsidian and let it return what it has.
 */
async function resolveTodoPlusSlice(
  app: App,
  sourceLink: string,
): Promise<TodoPlusSlice | null> {
  // Source link can be `dash002#To-do`, `[[dash002#To-do]]`, or
  // `[[dash002#To-do|alias]]`. Normalize to a `{path, heading}` pair.
  const parsed = parseTodoPlusSourceLink(sourceLink);
  if (!parsed) return Promise.resolve(null);

  // Resolve the path with `getFirstLinkpathDest` (Obsidian's standard
  // link resolver, which handles aliases, basenames, etc.).
  const dest = app.metadataCache.getFirstLinkpathDest(parsed.path, "");
  if (!(dest instanceof TFile)) return Promise.resolve(null);

  // Wait for the metadata cache to be populated for this file. On
  // workspace open / plugin load, the cache can be empty or
  // incomplete for files the user hasn't opened yet. We listen for
  // the first `changed` event for this file, with a generous timeout
  // so we don't hang indefinitely on weird states.
  const cache =
    (await waitForFileCache(app, dest)) ?? app.metadataCache.getFileCache(dest);
  const headings = cache?.headings ?? [];
  const target = headings.find(
    (h) => h.level === 2 && h.heading === parsed.heading,
  );
  if (!target) return Promise.resolve(null);

  // Find the end of the slice: the next heading at level <= 2, or
  // EOF. We read the cached file once and compute offsets.
  // `cachedRead` is preferred over `read` because it skips disk I/O
  // when the file is already in memory.
  const content = await app.vault.cachedRead(dest);
  const start = target.position.start.offset ?? 0;
  const endCandidates = headings
    .filter(
      (h) =>
        (h.position.start.offset ?? 0) > start &&
        h.level <= 2 &&
        h.heading !== parsed.heading,
    )
    .map((h) => h.position.start.offset ?? content.length)
    .filter((off) => off > start);
  const end =
    endCandidates.length > 0 ? Math.min(...endCandidates) : content.length;

  // Parse `- [ ]` / `- [x]` items inside the slice.
  const sliceContent = content.slice(start, end);
  const items = parseTodoPlusChecklist(sliceContent, start);

  return Promise.resolve({
    file: dest,
    heading: parsed.heading,
    start,
    end,
    items,
  });
}

/**
 * Waits for `app.metadataCache.getFileCache(file)` to return a
 * populated cache (with `headings` parsed). On a fresh Obsidian
 * startup the cache can be empty / partial for files the user
 * hasn't opened yet, so this returns the cache once the next
 * `metadataCache.on("changed")` event for that file fires — or
 * after a 2.5s timeout, whichever comes first. If the cache is
 * already populated, returns synchronously.
 */
function waitForFileCache(
  app: App,
  file: TFile,
  timeoutMs: number = 2500,
): Promise<CachedMetadata | null> {
  const initial = app.metadataCache.getFileCache(file);
  if (initial && initial.headings) {
    return Promise.resolve(initial);
  }
  return new Promise<CachedMetadata | null>((resolve) => {
    let ref: any = null;
    const cleanup = () => {
      if (ref) {
        app.metadataCache.offref(ref);
        ref = null;
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(app.metadataCache.getFileCache(file));
    }, timeoutMs);
    ref = app.metadataCache.on("changed", (f) => {
      if (f === file) {
        clearTimeout(timer);
        cleanup();
        resolve(app.metadataCache.getFileCache(file));
      }
    });
  });
}

/**
 * Schedules a reactive refresh for a TodoPlus card. Whenever the
 * source file's metadataCache `changed` event fires (the user
 * added/removed/checked/unchecked tasks in `dash002`), we wipe the
 * card's body and re-render it. The listener is automatically torn
 * down when the card leaves the DOM, so we don't leak observers on
 * long-lived sessions.
 */
function scheduleTodoPlusRefresh(
  app: App,
  listEl: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  settings?: DashboardSettings,
): void {
  const cardEl = listEl.closest(".dashboard-card") as HTMLElement | null;
  if (!cardEl) return;
  const sourcePath = listEl.dataset.todoplusFile;
  if (!sourcePath) return;

  const onChange = (file: TFile) => {
    if (file.path !== sourcePath) return;
    if (!document.body.contains(cardEl)) return;
    // Re-render the entire body (clear + re-dispatch to
    // renderTodoPlusBody). The header is a sibling in the parent
    // container, so we only need to empty the listEl — but the
    // body is built top-down in renderTodoPlusBody, so we instead
    // rebuild from the closest `.dashboard-card-content` (or the
    // body root) up.
    const bodyRoot = cardEl.querySelector(
      ".dashboard-card-body",
    ) as HTMLElement | null;
    if (bodyRoot) {
      bodyRoot.empty();
      void renderTodoPlusBody(bodyRoot, card, callbacks, app, settings);
    }
  };
  const ref = app.metadataCache.on("changed", onChange);

  // Tear down the listener when the card leaves the DOM. The
  // MutationObserver on `document.body` is a deliberately broad
  // subscription because Obsidian can detach and re-attach the
  // card at any time (e.g. switching dashboard tabs, scrolling,
  // re-rendering after a save).
  const teardown = () => {
    app.metadataCache.offref(ref);
    observer.disconnect();
  };
  const observer = new MutationObserver(() => {
    if (!document.body.contains(cardEl)) teardown();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Splits `card.sourceLink` into `{path, heading}`. Accepts:
 *
 *   - `dash002#To-do`          → `{ path: "dash002", heading: "To-do" }`
 *   - `[[dash002#To-do]]`      → same
 *   - `[[dash002#To-do|alias]]`→ same
 *   - `dash002`                → `{ path: "dash002", heading: "To-do" }` (default heading)
 *
 * Returns `null` if the input is empty.
 *
 * NOTE: there is no per-card `sourceLink` field anymore — the source
 * link lives in the card's `title` (a wikilink). Callers pass
 * `card.title` (or any source string) directly.
 */
function parseTodoPlusSourceLink(
  raw: string,
): { path: string; heading: string } | null {
  const text = raw.trim();
  if (!text) return null;
  // Strip `[[ ]]` wrapper.
  const inner = text.replace(/^\[\[/, "").replace(/]]$/, "").trim();
  // Strip `|alias` tail.
  const pipeIdx = inner.indexOf("|");
  const linkPart = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
  // Split on first `#`.
  const hashIdx = linkPart.indexOf("#");
  if (hashIdx < 0) {
    return { path: linkPart.trim(), heading: "To-do" };
  }
  const path = linkPart.slice(0, hashIdx).trim();
  const heading = linkPart.slice(hashIdx + 1).trim();
  if (!path || !heading) return null;
  return { path, heading };
}

/**
 * Reads the source link out of a TodoPlus card's `title`. The title
 * is expected to be a wikilink of the form `[[note#heading]]` (the
 * only on-disk representation). Returns the canonical
 * `"note#heading"` string (no `[[ ]]` wrapper, no `|alias` tail), or
 * `""` when the title is empty / not a usable wikilink. This is the
 * single source-of-truth reader: there is no per-card `sourceLink`
 * field on the DashboardCard type anymore.
 */
function getTodoPlusSourceLinkFromTitle(card: DashboardCard): string {
  const title = (card.title ?? "").trim();
  if (!title) return "";
  const parsed = parseTodoPlusSourceLink(title);
  if (!parsed) return "";
  return `${parsed.path}#${parsed.heading}`;
}

/**
 * Parses the checklist inside a heading slice. Each item carries
 * absolute offsets into the source file so we can write back to the
 * exact line later (we never recompute offsets against the full
 * string, which avoids drift if the slice gets trimmed or the file
 * is large).
 */
function parseTodoPlusChecklist(
  slice: string,
  baseOffset: number,
): TodoPlusChecklistItem[] {
  const items: TodoPlusChecklistItem[] = [];
  const lineOffsets: number[] = [];
  // Build a `lineStart` index for the slice (offsets relative to the
  // slice, not the full file).
  let cursor = 0;
  for (const part of slice.split("\n")) {
    lineOffsets.push(cursor);
    cursor += part.length + 1; // +1 for the \n
  }
  for (let i = 0; i < lineOffsets.length; i++) {
    const relStart = lineOffsets[i];
    const lineEndRel = relStart + slice.slice(relStart).indexOf("\n");
    const line = slice.slice(
      relStart,
      lineEndRel < relStart ? slice.length : lineEndRel,
    );
    // Match `- [ ] text` or `- [x] text` (case-insensitive on x).
    // We deliberately do not allow other bullet styles (`*`, `+`,
    // numbered lists) — TodoPlus mirrors a markdown task list and
    // we don't want to silently misinterpret other bullets.
    const m = line.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const text = m[2].trim();
    items.push({
      lineStart: baseOffset + relStart,
      lineEnd: baseOffset + (lineEndRel < relStart ? slice.length : lineEndRel),
      checked,
      text,
    });
  }
  return items;
}

/**
 * Toggles a single TodoPlus checklist line in the source file by
 * rewriting only the `- [ ]` / `- [x]` portion of that line. We use
 * `vault.process` so Obsidian owns the file modification event
 * (metadataCache refresh, file watchers, etc.).
 */
async function setTodoPlusItemChecked(
  app: App,
  file: TFile,
  item: TodoPlusChecklistItem,
  checked: boolean,
): Promise<void> {
  await app.vault.process(file, (content) => {
    const before = content.slice(0, item.lineStart);
    const line = content.slice(item.lineStart, item.lineEnd);
    const after = content.slice(item.lineEnd);
    const replaced = line.replace(
      /^(\s*-\s+\[)( |x|X)(\]\s+.*)$/,
      (_full, head: string, _box: string, tail: string) =>
        `${head}${checked ? "x" : " "}${tail}`,
    );
    return before + replaced + after;
  });
}

/**
 * Appends a new unchecked `- [ ] text` line to the `## <heading>`
 * block in `file`. Insertion point is the **end of the heading
 * slice** (right before the next same-or-higher-level heading, or
 * EOF if there isn't one). The trailing newline of the previous
 * content is preserved so we never collapse two paragraphs into one.
 *
 * If the heading doesn't exist yet we append a fresh `## <heading>`
 * block at the end of the file (so the user can start adding tasks
 * immediately — matches the behaviour of the add-card flow).
 */
async function addTodoPlusItem(
  app: App,
  file: TFile,
  heading: string,
  text: string,
): Promise<void> {
  const safeText = text.replace(/\r?\n/g, " ").trim();
  await app.vault.process(file, (content) => {
    const lines = content.split("\n");
    // Locate the heading line (exact text match, level-2 by convention).
    const headingIdx = lines.findIndex(
      (l) => /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim() === heading,
    );
    if (headingIdx < 0) {
      // Heading missing — append a fresh block.
      const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      return `${content}${prefix}\n## ${heading}\n- [ ] ${safeText}\n`;
    }
    // Find the end of the heading slice: the next heading at level
    // <= 2 (we only auto-create level-2 headings, but be safe and
    // match the same slice rule the read path uses).
    const headingLevel = lines[headingIdx]!.match(/^#+/)?.[0].length ?? 2;
    let endIdx = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const m = lines[i]!.match(/^(#+)\s/);
      if (m && m[1]!.length <= headingLevel) {
        endIdx = i;
        break;
      }
    }
    // Trim any blank lines at the tail of the slice so the new item
    // lands RIGHT AFTER the last non-blank line (a previous task).
    // Without this, every add reintroduces a blank line between the
    // last task and the new one — the list visibly "drifts" apart
    // over time and the file grows with empty lines in the middle.
    // We preserve the original tail structure when there is no
    // following heading (`endIdx === lines.length`): if the file
    // ended with a blank line we still trim it so the EOF shape is
    // tight, matching the v1.4.4 ask "remove the newlines in the
    // middle".
    while (endIdx > headingIdx + 1 && lines[endIdx - 1]!.trim() === "") {
      endIdx--;
    }
    // Insert a new unchecked item right before the end of the slice.
    // The `lines` array was built by splitting on `\n`, so a single
    // `splice + join` round-trip preserves the original line endings
    // byte-for-byte.
    const newLines = [...lines];
    newLines.splice(endIdx, 0, `- [ ] ${safeText}`);
    return newLines.join("\n");
  });
}

/**
 * Deletes a single TodoPlus checklist line from the source file.
 * We slice from the start of the line up to and including the
 * trailing newline (so we never leave a stray empty line behind).
 * If the line happens to be the last line in the file and has no
 * trailing newline, we drop the line content only.
 */
async function removeTodoPlusItem(
  app: App,
  file: TFile,
  item: TodoPlusChecklistItem,
): Promise<void> {
  await app.vault.process(file, (content) => {
    const before = content.slice(0, item.lineStart);
    const after = content.slice(item.lineEnd);
    // The character right after `item.lineEnd` should be a newline
    // (that's where the line ended). Drop it too so we don't leave
    // a blank line behind. If there is no trailing newline (last
    // line in the file without `\n`), don't add one.
    if (after.startsWith("\n")) {
      return before + after.slice(1);
    }
    return before + after;
  });
}

/**
 * Rewrites the **text portion** of a TodoPlus checklist line,
 * preserving the `- [ ]` / `- [x]` marker, the leading whitespace,
 * and the trailing newline. We never touch the checkbox state from
 * this path — use `setTodoPlusItemChecked` for that.
 */
async function editTodoPlusItem(
  app: App,
  file: TFile,
  item: TodoPlusChecklistItem,
  newText: string,
): Promise<void> {
  const safeText = newText.replace(/\r?\n/g, " ").trim();
  await app.vault.process(file, (content) => {
    const before = content.slice(0, item.lineStart);
    const line = content.slice(item.lineStart, item.lineEnd);
    const after = content.slice(item.lineEnd);
    const replaced = line.replace(/^(\s*-\s+\[[ x]\])\s+.*$/, `$1 ${safeText}`);
    return before + replaced + after;
  });
}

/**
 * Prompts the user to set / change the source link of a TodoPlus
 * card. The link is stored in the card's `title` field (as a
 * wikilink `[[note#heading]]`); there is no separate per-card
 * `sourceLink` field. We use a `prompt` modal (matches the add-card
 * flow) and write the result through `onCardEdit`.
 */
async function promptTodoPlusSourceLink(
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  _settings?: DashboardSettings,
): Promise<void> {
  // Prefill the prompt with the current source link (parsed from the
  // card title for display — strip the `[[ ]]` so the user sees the
  // canonical `note#heading` form).
  const currentSource = getTodoPlusSourceLinkFromTitle(card);
  const next = window.prompt(t("renderer.todoPlusPromptLabel"), currentSource);
  if (next === null) return; // cancelled
  const cleaned = next.trim();
  if (!cleaned) return;
  // Validate the link resolves to a real file.
  const parsed = parseTodoPlusSourceLink(cleaned);
  if (!parsed) {
    new Notice(t("renderer.todoPlusInvalidLink"));
    return;
  }
  const dest = app.metadataCache.getFirstLinkpathDest(parsed.path, "");
  if (!(dest instanceof TFile)) {
    new Notice(t("renderer.todoPlusFileNotFound", { path: parsed.path }));
    return;
  }
  // If the heading doesn't exist yet, append it (so the user can
  // start writing tasks immediately).
  const cache = app.metadataCache.getFileCache(dest);
  const headings = cache?.headings ?? [];
  const exists = headings.some(
    (h) => h.level === 2 && h.heading === parsed.heading,
  );
  if (!exists) {
    try {
      await app.vault.process(dest, (content) => {
        // Make sure the file ends with a newline before we append.
        const prefix =
          content.length > 0 && !content.endsWith("\n") ? "\n" : "";
        return `${content}${prefix}\n## ${parsed.heading}\n`;
      });
    } catch (e) {
      new Notice(
        t("renderer.todoPlusWriteError", { message: (e as Error).message }),
      );
      return;
    }
  }
  // The source link is stored entirely in the card's `title` (a
  // wikilink). Wrap with `[[ ]]` if the user gave a bare form so
  // the header renders as a clickable `[[note#heading]]` label.
  const titleWikilink = cleaned.startsWith("[[") ? cleaned : `[[${cleaned}]]`;
  callbacks.onCardEdit({ ...card, title: titleWikilink });
}

/**
 * Opens a vault-wide note search modal for the user to pick a
 * TodoPlus mirror source. This is the column-header "+" entry
 * point for `sectionType === "todoplus"`.
 *
 * The modal reuses the same `DocSearchModal` widget that the
 * Project section uses, so the user gets a single consistent
 * note-picker across the dashboard. The picked `TFile` is handed
 * off to `addTodoPlusCardFromNote`.
 *
 * Unlike the legacy wikilink-form input flow, this picker does
 * **not** require the target note to have a `## To-do` heading
 * beforehand — the heading is auto-created on the fly inside
 * `addTodoPlusCardFromNote`. The user can also pick notes that
 * aren't meant to be the mirror at all and then cancel by
 * closing the modal (no card is created on cancel).
 */
function openTodoPlusNoteSearchModal(
  column: DashboardColumn,
  callbacks: RenderCallbacks,
  app: App,
): void {
  // Defer the modal's auto-focus and the close-on-pick contract
  // by using a single-shot onSelect. We do NOT keep a reference
  // to the modal — the modal closes itself in its own click
  // handler (`DocSearchModal.onOpen`) and we drive the add from
  // the onSelect callback.
  const modal = new DocSearchModal(app, (link) => {
    // DocSearchModal hands us `{ name, path }` where `path` is
    // the vault-relative file path. Resolve it back to a TFile
    // so the heading-append step can work with a concrete
    // `TFile` (matches the rest of the TodoPlus code).
    const dest = app.vault.getFileByPath(link.path);
    if (!(dest instanceof TFile)) {
      new Notice(t("renderer.todoPlusFileNotFound", { path: link.path }));
      return;
    }
    void addTodoPlusCardFromNote(column, dest, callbacks, app);
  });
  modal.open();
}

/**
 * Adds a new TodoPlus card to `column` mirroring the
 * `## To-do` checklist of `file`. The card's on-disk identity
 * is the wikilink title `[[file.basename#To-do]]` (no
 * per-card `type:` or `sourceLink:` metadata line — both are
 * derivable from the column's `sectionType` and the title).
 *
 * If the picked note does not yet have a `## To-do` heading,
 * we append a fresh `## To-do` block to it via `vault.process`
 * so the new card has a real checklist to mirror immediately.
 * This is the "even if no `## To-do` exists, you can still add"
 * behaviour — the user is not blocked on a manual prep step.
 *
 * The on-disk format mirrors a regular Todo card body:
 *   - [[note#To-do]]
 * plus its indented metadata (cover / width / size / grid).
 */
async function addTodoPlusCardFromNote(
  column: DashboardColumn,
  file: TFile,
  callbacks: RenderCallbacks,
  app: App,
): Promise<void> {
  // The mirror heading we always target. The user can still
  // change this per-card via the "Set source" button (which
  // re-uses the same heading-create flow).
  const heading = "To-do";
  const cache = app.metadataCache.getFileCache(file);
  const headings = cache?.headings ?? [];
  const exists = headings.some((h) => h.level === 2 && h.heading === heading);
  if (!exists) {
    try {
      await app.vault.process(file, (content) => {
        // Append a fresh `## To-do` block at the end of the file.
        // We strip any trailing newlines from the existing content
        // and re-add a single separator so the heading sits on its
        // own line with no extra blank line in the middle — matches
        // the v1.4.4 ask "remove the newlines in the middle" (a
        // blank line between body and heading was being inserted
        // unconditionally before).
        const trimmed = content.replace(/\n+$/, "");
        return `${trimmed}\n## ${heading}\n`;
      });
    } catch (e) {
      new Notice(
        t("renderer.todoPlusWriteError", { message: (e as Error).message }),
      );
      return;
    }
  }
  // Build the canonical wikilink title the way every other
  // TodoPlus card does it: `[[note#To-do]]`. We use `file.basename`
  // (the `.md`-stripped name TFile already gives us) rather than
  // the `pathToWikiLink` helper because `pathToWikiLink` itself
  // wraps the result in `[[ ]]` — wrapping it a second time here
  // produced the malformed `[[[[note]]#To-do]]` title.
  const wikilinkTitle = `[[${file.basename}#${heading}]]`;
  // Forward to the view layer, which is responsible for
  // actually mutating the in-memory `DashboardData` and writing
  // the change back to disk. The `options.title` shape is the
  // single contract between renderer and view for the new
  // card's identity (see `RenderCallbacks.onCardAdd`).
  callbacks.onCardAdd(column.name, { title: wikilinkTitle });
}

function getSectionType(column: DashboardColumn): string {
  if (column.sectionType) return column.sectionType;
  const lower = column.name.toLowerCase();
  if (lower === "memo") return "memo";
  if (lower === "todo") return "todo";
  if (lower === "projects") return "projects";
  if (lower === "notes") return "notes";
  if (lower === "dashboard") return "dashboard";
  if (lower === "library") return "library";
  // TodoPlus: explicit section name "TodoPlus" / "待办Plus" / "todo plus" /
  // any time the column only contains `todoplus` cards.
  if (
    lower === "todoplus" ||
    lower === "todo plus" ||
    lower === "待办plus" ||
    lower === "待办 plus"
  )
    return "todoplus";
  if (column.cards.length > 0) {
    const types = new Set(column.cards.map((c) => c.type));
    const dashboardTypes = new Set(["chart", "weather", "tracker"]);
    if ([...types].every((t) => dashboardTypes.has(t)) && types.size > 0)
      return "dashboard";
    if (types.has("todoplus") && types.size === 1) return "todoplus";
    if (types.has("task") && types.size === 1) return "todo";
    if (types.has("task") && !types.has("project")) return "todo";
    if (types.has("project") && types.size === 1) return "projects";
    if (types.has("generic") && !types.has("project") && !types.has("task"))
      return "memo";
  }
  return "projects";
}

function renderTextWithLinks(
  container: HTMLElement,
  text: string,
  app: App,
): void {
  const parts = text.split(/(\[\[[^\]]+?\]\]|\[[^\]]+\]\([^)]+\))/g);
  for (const part of parts) {
    const wikiMatch = part.match(/^\[\[([^\]]+)\]\]$/);
    if (wikiMatch) {
      renderWikilink(container, wikiMatch[1]!, app);
      continue;
    }
    const extMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (extMatch) {
      renderExternalLink(container, extMatch[1]!, extMatch[2]!);
      continue;
    }
    if (part) {
      container.appendChild(document.createTextNode(part));
    }
  }
}

function renderWikilink(
  container: HTMLElement,
  content: string,
  app: App,
): void {
  let alias: string | undefined;
  let linkPart = content;

  const pipeIdx = content.indexOf("|");
  if (pipeIdx !== -1) {
    alias = content.slice(pipeIdx + 1);
    linkPart = content.slice(0, pipeIdx);
  }

  let path = linkPart;
  let fragment: string | undefined;

  const hashIdx = linkPart.indexOf("#");
  if (hashIdx !== -1) {
    path = linkPart.slice(0, hashIdx);
    fragment = linkPart.slice(hashIdx + 1);
  }

  const noteName = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  let displayName: string;
  if (alias) {
    displayName = alias;
  } else if (fragment) {
    displayName = `${noteName} > ${fragment}`;
  } else {
    // Show short name; if duplicate basenames exist, show parent folder
    const basename = noteName;
    try {
      const allFiles = getSearchableFiles(app);
      const sameNameFiles = allFiles.filter((mf) => mf.basename === basename);
      if (sameNameFiles.length > 1) {
        // Show parent folder to disambiguate
        const parts = path.split("/");
        if (parts.length >= 2) {
          displayName = `${parts[parts.length - 2]}/${noteName}`;
        } else {
          displayName = noteName;
        }
      } else {
        displayName = noteName;
      }
    } catch (err) {
      console.error(
        "[peingxious-dashboard] renderWikilink getSearchableFiles FAILED:",
        err,
      );
      displayName = noteName;
    }
  }

  const link = container.createSpan({
    cls: "dashboard-wikilink internal-link",
    text: displayName,
    attr: {
      "data-href": fragment ? `${path}#${fragment}` : path,
      href: fragment ? `${path}#${fragment}` : path,
    },
  });

  const linkText = fragment ? `${path}#${fragment}` : path;

  link.addEventListener("click", (e) => {
    e.stopPropagation();
    // Use native Obsidian link resolution for proper fragment/heading navigation
    app.workspace.openLinkText(linkText, "", false, { active: true });
  });

  // Native right-click context menu. The dashboard renders wikilinks as
  // plain spans, not via the markdown post-processor, so Obsidian's
  // global "show on internal-link" hook never sees them. We re-create
  // the *file* context menu by hand — the one the user gets when
  // right-clicking a note in the File Explorer (Open in new tab / pane
  // / window, Rename, Move to, Star, Delete, Reveal in OS, etc.).
  //
  // The trick: resolve the wikilink text to a real TFile, then fire the
  // "file-menu" workspace event. Obsidian core + every community plugin
  // (Page Preview, Recent Files, Excalidraw, ...) listens for that event
  // and contributes its entries, so we get the exact same menu as a
  // real file-explorer right-click — without us having to add a single
  // item by hand.
  link.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourcePath = app.workspace.getActiveFile()?.path ?? "";

    // fragment-only links (e.g. current-note headings) and unresolved
    // wikilinks have no backing file — fall back to Obsidian's own
    // link-menu (with our built-in defaults below) for those, so the
    // user still gets a useful menu.
    const linkPath = fragment ? path : linkText;
    const file = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (file) {
      const menu = new Menu();
      app.workspace.trigger("file-menu", menu, file, sourcePath);
      menu.showAtMouseEvent(e);
      return;
    }

    // Fallback for unresolved links: built-in "Open" actions.
    const fallback = new Menu();
    fallback.addItem((item) =>
      item
        .setTitle(t("renderer.openLink") || "Open link")
        .setIcon("file-text")
        .onClick(() => {
          void app.workspace.openLinkText(linkText, "", false);
        }),
    );
    fallback.addItem((item) =>
      item
        .setTitle(t("renderer.openLinkNewTab") || "Open link in new pane")
        .setIcon("external-link")
        .onClick(() => {
          void app.workspace.openLinkText(linkText, "", false, {
            newLeaf: true,
          } as Parameters<typeof app.workspace.openLinkText>[3]);
        }),
    );
    fallback.addSeparator();
    fallback.addItem((item) =>
      item
        .setTitle(t("renderer.copyLink") || "Copy link")
        .setIcon("copy")
        .onClick(() => {
          const linkMd = alias
            ? `[[${linkPart}${fragment ? `#${fragment}` : ""}|${alias}]]`
            : `[[${linkText}]]`;
          void navigator.clipboard.writeText(linkMd);
          new Notice(t("renderer.linkCopied") || "Link copied");
        }),
    );
    fallback.showAtMouseEvent(e);
  });

  // Hover-driven native Page Preview (Obsidian internal-link style).
  //
  // Obsidian's Page Preview core plugin is driven by a workspace-level
  // "link-hover" event. The markdown post-processor fires this event
  // when the user hovers an internal-link element; Page Preview then
  // reads the user's setting (Settings → Page Preview → "Reader mode"
  // / "Hover" vs "Ctrl/Cmd + hover") and decides whether to pop the
  // preview panel.
  //
  // Our dashboard wikilinks are custom DOM (not markdown-rendered),
  // so the post-processor never sees them and Page Preview never
  // activates. We bridge that gap by dispatching "link-hover"
  // ourselves on plain mouseover, exactly the same way the markdown
  // post-processor does in the editor. Page Preview then takes over
  // and shows the same native popover (fragment navigation, embeds,
  // "Open" / "Open to the right" all work as expected).
  let hoverTimer: number | null = null;
  const clearHoverTimer = (): void => {
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };
  link.addEventListener("mouseover", (event) => {
    if (hoverTimer !== null) return;
    // If the link was already detached (e.g. mid-render swap), bail.
    if (!link.isConnected) return;
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null;
      // The link may have been re-rendered (and thus detached)
      // during the delay window; in that case we must NOT fire the
      // event on a stale node.
      if (!link.isConnected) return;
      // Cast through unknown — "link-hover" is dispatched by
      // Obsidian internals and isn't in the public .d.ts, but every
      // Page Preview install listens for it.
      (
        app.workspace as unknown as {
          trigger: (
            type: string,
            evt: MouseEvent,
            target: HTMLElement,
            linkText: string,
            source: string,
          ) => void;
        }
      ).trigger("link-hover", event, link, linkText, "peingxious-dashboard");
    }, 200);
  });
  link.addEventListener("mouseout", clearHoverTimer);
  // If the user mouses out, hits a key, or the link gets re-rendered
  // before the timer fires, drop it so we don't pop a preview that
  // no longer matches the cursor position.
  link.addEventListener("keydown", clearHoverTimer);
}

function renderExternalLink(
  container: HTMLElement,
  text: string,
  url: string,
): void {
  const link = container.createSpan({
    cls: "dashboard-external-link",
    text: text,
  });
  link.addEventListener("click", (e) => {
    e.stopPropagation();
    window.open(url, "_blank");
  });
}

function isReminderOverdue(reminder: string): boolean {
  const now = new Date();
  const parts = reminder.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const dateStr = parts[0]!;
  const timeStr = parts[1]!;
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, min] = timeStr.split(":").map(Number);
  if (!year || !month || !day) return false;
  const due = new Date(year, month - 1, day, hour ?? 0, min ?? 0);
  return now >= due;
}

function createReminderButton(
  taskItem: HTMLElement,
  cardId: string,
  taskIndex: number,
  task: TaskItem,
  callbacks: RenderCallbacks,
): HTMLElement {
  const btn = document.createElement("button");
  btn.setAttribute("draggable", "false");
  btn.addClass("dashboard-task-reminder-btn");

  if (task.reminder) {
    btn.addClass("dashboard-task-reminder-btn--active");
    setIcon(btn, "bell-ring");
    btn.setAttribute("aria-label", t("reminder.editReminder"));
    if (!task.checked && isReminderOverdue(task.reminder)) {
      btn.addClass("dashboard-task-reminder-btn--overdue");
    }
  } else {
    setIcon(btn, "bell");
    btn.setAttribute("aria-label", t("reminder.setReminder"));
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    showReminderPopup(btn, cardId, taskIndex, task, callbacks);
  });

  return btn;
}

function showReminderPopup(
  anchorBtn: HTMLElement,
  cardId: string,
  taskIndex: number,
  task: TaskItem,
  callbacks: RenderCallbacks,
): void {
  closeAllReminderPopups();

  const popup = document.body.createDiv({
    cls: "dashboard-task-reminder-popup",
  });

  // Inherit theme variables from dashboard root (popup is on body, outside theme scope)
  const dashboardRoot = anchorBtn.closest(
    ".peingxious-dashboard-root",
  ) as HTMLElement;
  if (dashboardRoot) {
    const rs = getComputedStyle(dashboardRoot);
    const themeVars = [
      "--db-bg",
      "--db-bg-card",
      "--db-bg-card-hover",
      "--db-border-card",
      "--db-text",
      "--db-text-muted",
      "--db-accent",
      "--db-radius-md",
      "--db-radius-sm",
      "--db-font",
    ];
    themeVars.forEach((v) => {
      const val = rs.getPropertyValue(v).trim();
      if (val) popup.style.setProperty(v, val);
    });
  }

  const rect = anchorBtn.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 4}px`;

  const popupWidth = 240;
  if (rect.left + popupWidth > window.innerWidth) {
    popup.style.right = `${window.innerWidth - rect.right}px`;
  } else {
    popup.style.left = `${rect.left}px`;
  }

  // Scroll & resize tracking — reposition popup when content moves
  const updatePopupPosition = () => {
    const r = anchorBtn.getBoundingClientRect();
    if (
      r.height === 0 ||
      r.bottom < 0 ||
      r.top > window.innerHeight ||
      r.right < 0 ||
      r.left > window.innerWidth
    ) {
      closeAllReminderPopups();
      return;
    }
    popup.style.top = `${r.bottom + 4}px`;
    if (r.left + popupWidth > window.innerWidth) {
      popup.style.right = `${window.innerWidth - r.right}px`;
      popup.style.left = "auto";
    } else {
      popup.style.left = `${r.left}px`;
      popup.style.right = "auto";
    }
  };
  document.addEventListener("scroll", updatePopupPosition, {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", updatePopupPosition);
  (popup as any).__reminderCleanup = () => {
    document.removeEventListener("scroll", updatePopupPosition, {
      capture: true,
    });
    window.removeEventListener("resize", updatePopupPosition);
  };

  // Parse initial values
  let selectedYear: number;
  let selectedMonth: number;
  let selectedDay: number;
  let selectedHour = 9;
  let selectedMin = 0;

  const now = new Date();
  if (task.reminder) {
    const parts = task.reminder.trim().split(/\s+/);
    const dp = parts[0]?.split("-").map(Number) ?? [];
    const tp = parts[1]?.split(":").map(Number) ?? [];
    selectedYear = dp[0] ?? now.getFullYear();
    selectedMonth = (dp[1] ?? now.getMonth() + 1) - 1;
    selectedDay = dp[2] ?? now.getDate();
    selectedHour = tp[0] ?? 9;
    selectedMin = tp[1] ?? 0;
  } else {
    selectedYear = now.getFullYear();
    selectedMonth = now.getMonth();
    selectedDay = now.getDate();
  }

  const viewYear = { value: selectedYear };
  const viewMonth = { value: selectedMonth };

  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Calendar nav
  const calNav = popup.createDiv({
    cls: "dashboard-task-reminder-calendar-nav",
  });
  const prevBtn = calNav.createEl("button", { text: "<" });
  const monthLabel = calNav.createEl("span");
  const nextBtn = calNav.createEl("button", { text: ">" });

  // Calendar grid
  const calGrid = popup.createDiv({ cls: "dashboard-task-reminder-calendar" });

  // Time picker
  const timeRow = popup.createDiv({ cls: "dashboard-task-reminder-time" });
  const hourSelect = timeRow.createEl("select");
  for (let h = 0; h < 24; h++) {
    const opt = hourSelect.createEl("option", {
      text: String(h).padStart(2, "0"),
      attr: { value: String(h) },
    });
    if (h === selectedHour) opt.selected = true;
  }
  timeRow.createSpan({ text: ":" });
  const minSelect = timeRow.createEl("select");
  for (let m = 0; m < 60; m++) {
    const opt = minSelect.createEl("option", {
      text: String(m).padStart(2, "0"),
      attr: { value: String(m) },
    });
    if (m === selectedMin) opt.selected = true;
  }

  // Action buttons
  const btnRow = popup.createDiv({ cls: "dashboard-task-reminder-popup-btns" });
  const saveBtn = btnRow.createEl("button", {
    cls: "mod-cta",
    text: t("common.save"),
  });
  if (task.reminder) {
    btnRow.createEl("button", {
      cls: "dashboard-task-reminder-clear",
      text: t("reminder.clearReminder"),
    });
  }

  const renderCalendar = () => {
    calGrid.empty();
    const y = viewYear.value;
    const m = viewMonth.value;
    monthLabel.setText(`${y}-${String(m + 1).padStart(2, "0")}`);

    for (const d of dayNames) {
      calGrid.createDiv({
        cls: "dashboard-task-reminder-calendar-header",
        text: d,
      });
    }

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      calGrid.createEl("button", {
        cls: "dashboard-task-reminder-calendar-day dashboard-task-reminder-calendar-day--other-month",
        text: String(d),
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cls = ["dashboard-task-reminder-calendar-day"];
      if (isCurrentMonth && d === today.getDate())
        cls.push("dashboard-task-reminder-calendar-day--today");
      if (y === selectedYear && m === selectedMonth && d === selectedDay)
        cls.push("dashboard-task-reminder-calendar-day--selected");

      const dayBtn = calGrid.createEl("button", {
        cls: cls.join(" "),
        text: String(d),
      });
      dayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedYear = y;
        selectedMonth = m;
        selectedDay = d;
        renderCalendar();
      });
    }

    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      calGrid.createEl("button", {
        cls: "dashboard-task-reminder-calendar-day dashboard-task-reminder-calendar-day--other-month",
        text: String(d),
      });
    }
  };

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    viewMonth.value--;
    if (viewMonth.value < 0) {
      viewMonth.value = 11;
      viewYear.value--;
    }
    renderCalendar();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    viewMonth.value++;
    if (viewMonth.value > 11) {
      viewMonth.value = 0;
      viewYear.value++;
    }
    renderCalendar();
  });

  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const h = parseInt(hourSelect.value, 10);
    const m = parseInt(minSelect.value, 10);
    const reminder = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    callbacks.onTaskReminderEdit(cardId, taskIndex, reminder);
    closeAllReminderPopups();
  });

  btnRow
    .querySelector(".dashboard-task-reminder-clear")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onTaskReminderEdit(cardId, taskIndex, undefined);
      closeAllReminderPopups();
    });

  const outsideClick = (ev: MouseEvent) => {
    if (!popup.contains(ev.target as Node)) {
      closeAllReminderPopups();
      document.removeEventListener("mousedown", outsideClick);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", outsideClick), 0);

  renderCalendar();
}

function closeAllReminderPopups(): void {
  document.querySelectorAll(".dashboard-task-reminder-popup").forEach((el) => {
    const popup = el as HTMLElement & { __reminderCleanup?: () => void };
    popup.__reminderCleanup?.();
    popup.remove();
  });
}

function renderWeatherBody(
  container: HTMLElement,
  card: DashboardCard,
  app: App,
): void {
  if (!card.weatherConfig) return;

  const el = container.createDiv({ cls: "dashboard-weather" });

  const cached = getCachedWeather(card.weatherConfig);
  if (cached) {
    renderWeatherContent(el, cached, card.weatherConfig.cityName);
  } else {
    el.createDiv({ cls: "dashboard-weather-loading", text: "..." });
    fetchWeather(card.weatherConfig)
      .then((data) => {
        el.empty();
        renderWeatherContent(el, data, card.weatherConfig!.cityName);
      })
      .catch(() => {
        el.empty();
        el.createDiv({
          cls: "dashboard-weather-error",
          text: t("weather.fetchError"),
        });
      });
  }
}

function renderWeatherContent(
  el: HTMLElement,
  data: import("./types").WeatherData,
  cityName: string,
): void {
  const current = el.createDiv({ cls: "dashboard-weather-current" });
  const tempWrap = current.createDiv({ cls: "dashboard-weather-temp-wrap" });
  tempWrap.createDiv({
    cls: "dashboard-weather-temp",
    text: `${Math.round(data.temperature)}\u00B0`,
  });
  tempWrap.createDiv({
    cls: "dashboard-weather-icon",
    text: getWeatherEmoji(data.weatherCode),
  });

  const details = current.createDiv({ cls: "dashboard-weather-details" });
  details.createDiv({ cls: "dashboard-weather-city", text: cityName });
  details.createDiv({
    cls: "dashboard-weather-desc",
    text: getWeatherDescription(data.weatherCode),
  });
  const metaLine = details.createDiv({ cls: "dashboard-weather-wind" });
  metaLine.createSpan({
    text: `${t("weather.feelsLike")} ${Math.round(data.feelsLike)}\u00B0  ${t("weather.humidity")} ${Math.round(data.humidity)}%  ${t("weather.wind")} ${Math.round(data.windSpeed)} km/h`,
  });

  if (data.dailyDates.length > 0) {
    const forecast = el.createDiv({ cls: "dashboard-weather-forecast" });
    const count = Math.min(data.dailyDates.length, 5);
    for (let i = 0; i < count; i++) {
      const day = forecast.createDiv({ cls: "dashboard-weather-day" });
      const d = new Date(data.dailyDates[i]! + "T00:00:00");
      const dayName = d.toLocaleDateString(
        getLanguage() === "zh" ? "zh-CN" : "en",
        { weekday: "short" },
      );
      day.createDiv({ cls: "dashboard-weather-day-name", text: dayName });
      day.createDiv({
        cls: "dashboard-weather-day-icon",
        text: getWeatherEmoji(data.dailyCodes[i]!),
      });
      day.createDiv({
        cls: "dashboard-weather-day-temps",
        text: `${Math.round(data.dailyMax[i]!)}\u00B0 / ${Math.round(data.dailyMin[i]!)}\u00B0`,
      });
    }
  }
}

function renderTrackerBody(
  container: HTMLElement,
  card: DashboardCard,
  app: App,
  settings?: import("./types").DashboardSettings,
): void {
  if (!card.trackerConfig) return;

  const config = card.trackerConfig;
  const size: CardSize = card.size || "M";
  const style: TrackerStyle = config.style || "line";
  destroyChart(card.id);

  const el = container.createDiv({
    cls: `dashboard-tracker dashboard-tracker--${size}`,
  });

  const data = readTrackerData(app, "", config.key, config.days);
  const validPoints = data.filter((p) => p.value !== null);

  if (validPoints.length === 0) {
    el.createDiv({
      cls: "dashboard-tracker-empty",
      text: t("tracker.noData") + ": " + config.key,
    });
    return;
  }

  const values = data.map((p) => p.value);
  const minVal = Math.min(...values.filter((v): v is number => v !== null));
  const maxVal = Math.max(...values.filter((v): v is number => v !== null));
  const sum = validPoints.reduce((s, p) => s + p.value!, 0);
  const avg = (sum / validPoints.length).toFixed(1);
  const latest = validPoints[validPoints.length - 1]!.value as number;
  const prev =
    validPoints.length > 1
      ? (validPoints[validPoints.length - 2]!.value as number)
      : latest;
  const trendDir = latest > prev ? "up" : latest < prev ? "down" : "flat";
  const trendPct =
    prev !== 0 ? (((latest - prev) / Math.abs(prev)) * 100).toFixed(1) : "0";

  // Streak: consecutive days with data (from latest backward)
  let streak = 0;
  for (let i = validPoints.length - 1; i >= 0; i--) {
    if (validPoints[i]!.value !== null) streak++;
    else break;
  }

  if (size === "S") {
    const row = el.createDiv({ cls: "dashboard-tracker-compact" });
    row.createDiv({
      cls: "dashboard-tracker-compact-value",
      text: String(latest),
    });
    const arrow = row.createDiv({
      cls: `dashboard-tracker-trend dashboard-tracker-trend--${trendDir}`,
    });
    arrow.setText(trendDir === "up" ? "↑" : trendDir === "down" ? "↓" : "→");
    if (config.key) {
      row.createDiv({
        cls: "dashboard-tracker-compact-label",
        text: config.key,
      });
    }
    return;
  }

  const accentColor = getCSSVar("--db-accent") || "#6366f1";

  // Dispatch by style
  if (style === "heatmap") {
    renderTrackerHeatmap(el, data, minVal, maxVal, size, accentColor);
  } else if (style === "bar") {
    renderTrackerBarChart(el, data, size, accentColor, card.id);
  } else {
    renderTrackerLineChart(el, data, size, accentColor, card.id);
  }

  // Stats
  const stats = el.createDiv({ cls: "dashboard-tracker-stats" });
  const addStat = (label: string, value: string | number) => {
    const stat = stats.createDiv({ cls: "dashboard-tracker-stat" });
    stat.createSpan({ cls: "dashboard-tracker-stat-label", text: label });
    stat.createSpan({
      cls: "dashboard-tracker-stat-value",
      text: String(value),
    });
  };
  addStat(t("tracker.current"), latest);
  addStat(t("tracker.avg"), avg);

  if (size === "M") {
    addStat(t("tracker.trend"), `${trendDir === "up" ? "+" : ""}${trendPct}%`);
  }

  if (size === "L") {
    addStat(t("tracker.trend"), `${trendDir === "up" ? "+" : ""}${trendPct}%`);
    addStat(t("tracker.streak"), `${streak}d`);
    addStat(t("tracker.min"), minVal);
    addStat(t("tracker.max"), maxVal);
  }
}

function renderTrackerLineChart(
  el: HTMLElement,
  data: import("./types").TrackerDataPoint[],
  size: CardSize,
  accentColor: string,
  cardId: string,
): void {
  const chartWrap = el.createDiv({ cls: "dashboard-tracker-chart" });
  const canvasEl = chartWrap.createEl("canvas", {
    cls: "dashboard-chart-canvas",
  });
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((p) => p.date.slice(5)),
      datasets: [
        {
          data: data.map((p) => p.value),
          borderColor: accentColor,
          backgroundColor: `${accentColor}22`,
          fill: true,
          tension: 0.4,
          pointRadius: size === "L" ? 3 : 0,
          pointHoverRadius: 5,
          pointBackgroundColor: accentColor,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { display: false },
        y: { display: false },
      },
      animation: { duration: 600 },
    },
  });
  chartInstances.set(cardId, chart);
}

function renderTrackerBarChart(
  el: HTMLElement,
  data: import("./types").TrackerDataPoint[],
  size: CardSize,
  accentColor: string,
  cardId: string,
): void {
  const chartWrap = el.createDiv({ cls: "dashboard-tracker-chart" });
  const canvasEl = chartWrap.createEl("canvas", {
    cls: "dashboard-chart-canvas",
  });
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;

  const textColor = getCSSVar("--db-text-muted") || "#888";
  const validVals = data.filter((p) => p.value !== null).map((p) => p.value!);
  const barMax = validVals.length > 0 ? Math.max(...validVals) : 1;

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map((p) => p.date.slice(5)),
      datasets: [
        {
          data: data.map((p) => p.value ?? 0),
          backgroundColor: data.map((p) => {
            if (p.value === null) return "transparent";
            const intensity = barMax > 0 ? p.value / barMax : 0;
            return `${accentColor}${Math.round(40 + intensity * 180)
              .toString(16)
              .padStart(2, "0")}`;
          }),
          borderRadius: 2,
          barPercentage: 0.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { display: false },
        y: {
          display: size === "L",
          grid: { display: false },
          ticks: { color: textColor, font: { size: 10 } },
        },
      },
      animation: { duration: 600 },
    },
  });
  chartInstances.set(cardId, chart);
}

function renderTrackerHeatmap(
  el: HTMLElement,
  data: import("./types").TrackerDataPoint[],
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
  const weeks: (import("./types").TrackerDataPoint | null)[][] = [];
  let currentWeek: (import("./types").TrackerDataPoint | null)[] = [];

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
