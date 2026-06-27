/**
 * Sidebar Pomodoro widget — moved from `src/renderer.ts` in
 * Step 8.7.4 of the v1.5.0 refactor.
 *
 * Owns three responsibilities, all originally defined in
 * `renderer.ts`:
 *
 *  1. `renderSidebarPomodoro` — the timer ring + start/stop button +
 *     activity selector. Listens to `service.onTick` /
 *     `service.onComplete` for live updates; updates the SVG ring
 *     and the per-session dots in place to avoid a full DOM
 *     refresh on every tick.
 *  2. `createActivitySelector` — the in-place editor for the
 *     Pomodoro "activity" string. Renders a colour dot + name and
 *     pops a small input panel (with recent-activity chips) on
 *     click.
 *  3. `showPomodoroStats` — the modal opened from the bar-chart
 *     button. Shows focus totals, a day/week/month range-toggle
 *     donut, and the last 10 sessions. The donut and the recent
 *     list are rebuilt on every range change rather than
 *     diffed — fine, since the cost is < 50 DOM nodes and the
 *     modal is dismissed on the next view re-render anyway.
 *
 * Time formatters (`formatMinutes`, `formatTime`) live in
 * `../format-utils` so the Reading widget can share them.
 */
import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { PomodoroService } from "../../pomodoro-service";
import { activityColor } from "../../pomodoro-service";
import { formatMinutes, formatTime } from "./format-utils";

/**
 * SVG ring constants. Centralised so the math (circumference,
 * radius) and the visual size stay in sync.
 */
const POMODORO_RING_SIZE = 72;
const POMODORO_RING_STROKE = 6;

/**
 * Range definitions for the stats donut. The `days` value is
 * passed straight to `service.getActivityBreakdownByRange`;
 * `label` is the human-readable toggle button text (already
 * localised through `t("pomodoro.rangeXxx")`).
 */
type PomodoroRange = { key: string; label: string; days: number };

/**
 * Build the localised range set. Pulled out of `showPomodoroStats`
 * so the same array can power the toggle button factory and the
 * donut key → label lookup without re-allocating it for the
 * initial render vs. subsequent range switches.
 */
function buildPomodoroRanges(): PomodoroRange[] {
  return [
    { key: "day", label: t("pomodoro.rangeDay"), days: 1 },
    { key: "week", label: t("pomodoro.rangeWeek"), days: 7 },
    { key: "month", label: t("pomodoro.rangeMonth"), days: 30 },
  ];
}

/**
 * Render the Pomodoro sidebar widget.
 *
 * The widget is rebuilt from scratch on every render — we
 * intentionally do NOT try to diff the ring / dots. The cost of
 * a re-render is < 30 DOM nodes, and the per-tick update path
 * (the SVG `stroke-dashoffset` and the timer textContent) does
 * NOT touch the outer widget, so steady-state cost is just the
 * per-second textContent writes.
 */
export function renderSidebarPomodoro(
  container: HTMLElement,
  service: PomodoroService,
  settings: import("../../types").DashboardSettings,
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
  const svgSize = POMODORO_RING_SIZE;
  const strokeWidth = POMODORO_RING_STROKE;
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

/**
 * Build the activity selector (colour dot + name, click to
 * edit). Returns an `updateActivityDisplay` so the outer widget
 * can refresh the chip when the service's activity changes for
 * other reasons (e.g. session completion).
 *
 * The `panel` reference is module-local closure state; the
 * open / close lifecycle is bound to clicks on the trigger and
 * to a single document-level click handler (installed once at
 * trigger build time). There is no removeEventListener call —
 * see `LEAK-POMODORO` note in `view.ts`'s dispose handler.
 */
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

/**
 * Pop up the stats modal. The modal owns its own close handler
 * (Esc key, overlay click, X button) and tears down the keydown
 * listener on close so the document doesn't accumulate handlers
 * across re-opens.
 */
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
  const ranges = buildPomodoroRanges();
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
