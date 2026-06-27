/**
 * Sidebar Countdown widget — moved from `src/renderer.ts` in
 * Step 8.7.5 of the v1.5.0 refactor.
 *
 * Renders a single countdown to a target date with a "value +
 * unit" flip animation, and exposes a settings button that
 * opens `CountdownSettingsModal`. The tick loop is registered
 * as a `setInterval` once per render and cleaned up via:
 *
 *  1. An explicit `cleanup()` function (called by the next
 *     render to cancel the previous timer — the content
 *     element caches the cleanup under `__countdownCleanup`).
 *  2. A `MutationObserver` watching `document.body` for
 *     removal of the content node (covers the case where
 *     the sidebar is torn down without a re-render).
 *
 * Why the `__countdownCleanup` stash: the sidebar can be
 * re-rendered in place (e.g. after a widget reorder, a
 * settings change, or a live-update from another tab).
 * Without an explicit teardown, the previous `setInterval`
 * would keep firing against a detached DOM node, leaking
 * timers and (worse) rewriting the textContent of a node
 * that is no longer visible. The stash pattern survives
 * across renders of the same content element.
 */
import type { App } from "obsidian";
import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { DashboardSettings } from "../../types";
import { CountdownSettingsModal } from "../../countdown-modal";

/**
 * Plugin id used to read the live `DashboardSettings` off the
 * plugin instance so settings changes propagate to the global
 * plugin object (and from there to every open dashboard).
 */
const PLUGIN_ID = "peingxious-dashboard";

/**
 * Tick interval (ms). 1 minute is the natural unit for day /
 * hour / minute countdowns — for the seconds display we'd
 * want 1s, but the current display modes are coarser.
 */
const COUNTDOWN_TICK_MS = 60_000;

/**
 * Flip-animation duration (ms). The CSS class
 * `.dashboard-sidebar-countdown-value--flip` runs an animation
 * with this duration; the JS timeout removes the class once
 * it ends so the next flip re-triggers the keyframes.
 */
const FLIP_ANIMATION_MS = 400;

/**
 * Internal cleanup stash type. We use a WeakMap-friendly
 * property on the content element so each render's cleanup
 * closure is reachable from the next render's teardown path.
 */
type CleanupCarrier = HTMLElement & { __countdownCleanup?: () => void };

/**
 * Build the (typed) cleanup carrier for the content element.
 * Centralised so the read / write paths agree on the shape.
 */
function asCarrier(el: HTMLElement): CleanupCarrier {
  return el as CleanupCarrier;
}

/**
 * Pull the dashboard settings + persist helpers off the
 * plugin instance. The settings mutation pattern (mutate
 * the local `settings` reference, then copy into
 * `plugin.settings` and call `saveSettings` +
 * `refreshAllDashboards`) is kept verbatim from the
 * pre-refactor implementation — that wiring is the
 * contract for the settings modal callback.
 */
function getDashboardPlugin(app: App): {
  settings?: DashboardSettings;
  saveSettings?: () => Promise<void>;
  refreshAllDashboards?: () => void;
} | null {
  const plugins = (
    app as unknown as {
      plugins?: { plugins?: Record<string, unknown> };
    }
  ).plugins;
  return (
    (plugins?.plugins?.[PLUGIN_ID] as
      | {
          settings?: DashboardSettings;
          saveSettings?: () => Promise<void>;
          refreshAllDashboards?: () => void;
        }
      | undefined) ?? null
  );
}

/**
 * Render the Countdown sidebar widget.
 *
 * Three render paths:
 *
 *  - No `countdownTargetDate` → placeholder ("set target").
 *  - `now >= target` → "expired" notice (optionally preceded
 *    by the "until <label>" header).
 *  - Active countdown → value + unit, with a 1-minute
 *    auto-refresh and a flip animation on value change.
 */
export function renderSidebarCountdown(
  container: HTMLElement,
  settings: DashboardSettings,
  app: App,
): void {
  const widget = container.createDiv({
    cls: "dashboard-sidebar-widget dashboard-sidebar-countdown",
  });

  // Settings button (absolute positioned)
  const settingsBtn = widget.createEl("button", {
    cls: "dashboard-sidebar-countdown-settings-btn",
    attr: {},
  });
  setIcon(settingsBtn, "settings");

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const modal = new CountdownSettingsModal(app, settings, async (updates) => {
      Object.assign(settings, updates);
      const plugin = getDashboardPlugin(app);
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
  const doc = content.ownerDocument;
  const priorCleanup = asCarrier(content).__countdownCleanup;
  priorCleanup?.();

  let timer: ReturnType<typeof setInterval> | null = null;
  let flipTimeout: ReturnType<typeof setTimeout> | null = null;
  let domObserver: MutationObserver | null = null;

  const cleanup = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (flipTimeout) {
      clearTimeout(flipTimeout);
      flipTimeout = null;
    }
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    asCarrier(content).__countdownCleanup = undefined;
  };

  asCarrier(content).__countdownCleanup = cleanup;

  if (typeof MutationObserver !== "undefined" && doc.body) {
    domObserver = new MutationObserver(() => {
      if (!doc.body.contains(content)) cleanup();
    });
    domObserver.observe(doc.body, { childList: true, subtree: true });
  }

  timer = setInterval(() => {
    const now2 = new Date();
    if (now2 >= target) {
      cleanup();
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
      if (flipTimeout) clearTimeout(flipTimeout);
      flipTimeout = setTimeout(() => {
        valueEl.removeClass("dashboard-sidebar-countdown-value--flip");
      }, FLIP_ANIMATION_MS);
    }
  }, COUNTDOWN_TICK_MS);
}
