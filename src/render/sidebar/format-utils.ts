/**
 * Shared formatters for the sidebar widgets.
 *
 * The Pomodoro and Reading widgets both need time / duration
 * formatters with subtle localisation differences (e.g. Pomodoro
 * shows "1h 30m" via `formatMinutes`, Reading shows "1h 30m"
 * via `formatReadingDuration`). Putting them in one place stops
 * the two widgets from re-implementing the same helpers, and
 * also avoids the "should this go in pomodoro or reading?"
 * bikeshed every time a new format is needed.
 *
 * Why these are pure functions (not classes / contexts):
 *   - All inputs are primitive numbers, all outputs are strings.
 *   - They never touch the DOM or any global state.
 *   - They are called on every tick (Pomodoro updates the time
 *     display every second) so they have to be allocation-free.
 */
import { t } from "../../i18n";

/**
 * Format a Pomodoro minute count. The output is localised through
 * `t("pomodoro.minutes")` and `t("pomodoro.hours")`, so a 90-minute
 * session renders as e.g. "1 小时 30 分钟" (zh) or "1 hours 30 minutes"
 * (en). Whole hours drop the trailing minutes component.
 */
export function formatMinutes(minutes: number): string {
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

/**
 * Format a number of seconds as `HH:MM:SS` or `MM:SS`.
 *
 * The `>= 3600` threshold is the natural break for showing the
 * hours field. Below one hour, leading zeros are still emitted
 * for the MM:SS portion (so a 65-second focus renders as
 * "01:05" rather than "1:5") to keep the timer display a
 * constant width — a sudden digit-count change would cause
 * the Pomodoro ring to jitter visually.
 */
export function formatTime(seconds: number): string {
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

/**
 * Reading-specific duration. Differs from `formatMinutes` in two
 * ways:
 *   1. Uses `reading.hours` / `reading.minutes` / `reading.timeHM`
 *      i18n keys (so the wording matches the reading widget UI).
 *   2. Below one minute, still renders as "1 min" (we floor at 1
 *      to avoid the "0 minutes" visual that confuses users —
 *      a sub-minute read is still a real session).
 */
export function formatReadingDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && mins > 0) return t("reading.timeHM", { h: hours, m: mins });
  if (hours > 0) return t("reading.hours", { count: hours });
  return t("reading.minutes", { count: Math.max(1, mins) });
}

/**
 * Compact "1h30m" / "45m" rendering used in the reading book
 * card per-day counter (where space is limited). Unlike
 * `formatReadingDuration` this is NOT localised — it is a
 * short visual chip, not a sentence, and forcing i18n on it
 * would make the layout unpredictable.
 */
export function formatShortDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + "m" : ""}`;
  return `${Math.max(1, m)}m`;
}
