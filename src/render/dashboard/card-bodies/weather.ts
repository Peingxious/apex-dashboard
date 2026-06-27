/**
 * Weather card body renderer — moved from src/renderer.ts in Step 8.6.5.
 *
 * Why split: keeps the 200+ lines of weather-specific UI logic out of the
 * 5000+ line renderer barrel, and lets future weather features (multiple
 * providers, hourly view, etc.) grow without bloating the main renderer.
 */
import type { App } from "obsidian";
import type { DashboardCard, WeatherData } from "../../../types";
import { t, getLanguage } from "../../../i18n";
import {
  fetchWeather,
  getCachedWeather,
  getWeatherEmoji,
  getWeatherDescription,
} from "../../../weather-service";

/**
 * Render the weather card body.
 * Steps:
 *  1. If a cached snapshot exists, paint it immediately (synchronous).
 *  2. Otherwise show a "..." loading placeholder and kick off the async
 *     fetch; on resolve, clear and re-render; on reject, paint the
 *     i18n error string.
 */
export function renderWeatherBody(
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

/**
 * Paint the weather content given a `WeatherData` payload. Renders a
 * current-condition row plus a 5-day forecast strip when daily data
 * is available. Day names are localized to zh-CN when i18n is "zh"
 * to match Obsidian's day-name conventions.
 */
function renderWeatherContent(
  el: HTMLElement,
  data: WeatherData,
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
