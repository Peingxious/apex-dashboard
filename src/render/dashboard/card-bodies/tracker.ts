/**
 * Tracker card body renderer — moved from src/renderer.ts in Step 8.6.5.
 *
 * The tracker has three visualization styles (line / bar / heatmap) and
 * three sizes (S / M / L) that branch on the same `card.size` and
 * `config.style` values. Keeping these branches together with the chart
 * factories (LineChart, BarChart) avoids the "where does the Chart.js
 * import live?" round-trip the old renderer.ts had.
 *
 * IMPORTANT — chart lifecycle: each call to `renderTrackerBody` calls
 * `releaseChart(card.id)` first. This guarantees the prior Chart.js
 * instance for this card is destroyed before we register a new one via
 * `acquireChart`. Combined with the chart pool's `destroyAllCharts` in
 * the view-level teardown, this prevents the v1.4.x "canvas reused"
 * memory leak (LEAK-002).
 */
import type { App } from "obsidian";
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
import type {
  CardSize,
  DashboardCard,
  DashboardSettings,
  TrackerDataPoint,
  TrackerStyle,
} from "../../../types";
import { t } from "../../../i18n";
import { readTrackerData } from "../../../tracker-service";
import { acquireChart, releaseChart } from "../../chart-pool";
import { getCSSVar } from "../../dom-helpers";
import { renderTrackerHeatmap } from "../../heatmap";

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

export function renderTrackerBody(
  container: HTMLElement,
  card: DashboardCard,
  app: App,
  settings?: DashboardSettings,
): void {
  if (!card.trackerConfig) return;

  const config = card.trackerConfig;
  const size: CardSize = card.size || "M";
  const style: TrackerStyle = config.style || "line";
  // Free any prior chart instance for this card id so a re-render
  // (e.g. size change) does not stack Chart.js instances on the
  // same canvas — see module docstring for full LEAK-002 context.
  releaseChart(card.id);

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
  data: TrackerDataPoint[],
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

  acquireChart(
    cardId,
    () =>
      new Chart(ctx, {
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
      }),
  );
}

function renderTrackerBarChart(
  el: HTMLElement,
  data: TrackerDataPoint[],
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

  acquireChart(
    cardId,
    () =>
      new Chart(ctx, {
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
      }),
  );
}
