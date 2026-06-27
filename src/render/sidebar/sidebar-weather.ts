/**
 * Sidebar weather widget — moved from `src/renderer.ts` in
 * Step 8.7.2.
 *
 * The sidebar weather is a *compact* version of the dashboard
 * card-body weather. It is intentionally NOT shared with
 * `render/dashboard/card-bodies/weather.ts` because the two
 * surfaces have different layouts (sidebar: single-row
 * icon + temp + 5-day strip; dashboard card: big current row
 * + multi-day forecast). The duplication is deliberate: it
 * keeps both renderers simple and lets each evolve
 * independently. The only thing they share is the
 * `weather-service` and the i18n keys.
 */
import type { App } from "obsidian";
import type { DashboardSettings, WeatherData } from "../../types";
import { t, getLanguage } from "../../i18n";
import {
  fetchWeather,
  getCachedWeather,
  getWeatherEmoji,
  getWeatherDescription,
} from "../../weather-service";

/**
 * Render the sidebar weather widget. Steps:
 *  1. Mount a placeholder div showing "..." so the layout is
 *     stable while the network request is in flight.
 *  2. If the weather service has a recent cache hit, paint
 *     synchronously (most reloads are served from cache).
 *  3. Otherwise kick off the async fetch. On success, clear and
 *     paint. On failure, paint an "--" error placeholder — we
 *     deliberately do NOT throw, because a missing weather
 *     feed should not break the rest of the sidebar.
 */
export function renderSidebarWeather(
  container: HTMLElement,
  settings: DashboardSettings,
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

/**
 * Paint the sidebar weather content. Differs from the dashboard
 * card-body version in that the layout is a single horizontal
 * row (icon | temp | details) and the forecast strip is compact
 * (weekday initial only, no high/low per day — only the first
 * day's "Today" label). The first daily entry is treated as
 * "today"; subsequent entries show their weekday name.
 */
function renderSidebarWeatherContent(
  el: HTMLElement,
  data: WeatherData,
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
