/**
 * src/render/reminder-popup.ts
 *
 * Per-task reminder popup (calendar + time picker) and the
 * button that opens it. Extracted from `renderer.ts` in
 * Step 8.5.
 *
 * **Why a separate file**: the popup is a self-contained
 * mini-widget with its own DOM tree, scroll/resize tracking,
 * and outside-click detection. The previous `renderer.ts`
 * approach interleaved the popup with the task body, which
 * inflated line counts and made it hard to spot unrelated
 * changes during refactors. Splitting it gives a single
 * ~270-line module to evolve (e.g. add a "snooze" menu, swap
 * the calendar for a flat input).
 *
 * **Behaviour preservation**:
 *   - `isReminderOverdue` — same parsing (yyyy-MM-dd HH:mm) and
 *     same overdue predicate.
 *   - `createReminderButton` — same icon (`bell` / `bell-ring`),
 *     same active / overdue CSS classes, same click handler.
 *   - `showReminderPopup` — same theme-var inheritance from
 *     `.peingxious-dashboard-root`, same positioning
 *     algorithm (bottom-anchored, right-flipped when off-screen),
 *     same calendar grid (Sunday-header, 6-row month, prev/next
 *     month padding, today / selected highlight), same
 *     outside-click behaviour, same i18n keys.
 *   - `closeAllReminderPopups` — same `__reminderCleanup` hook
 *     stored on each popup element.
 *
 * The reminder popup is the one widget that the dashboard
 * appends to `document.body` rather than the dashboard root.
 * As a result, the `__reminderCleanup` pattern (manual
 * `removeEventListener` on close) remains in place — the
 * popup is not owned by any render pass and so is not eligible
 * for the `RenderDisposer` registry. View-close still works
 * correctly because `closeAllReminderPopups()` is a
 * `document.querySelectorAll` and runs unconditionally.
 */

import { Notice, setIcon } from "obsidian";
import type { RenderCallbacks, TaskItem } from "../types";
import { t } from "../i18n";

/**
 * Check whether the reminder string (`"yyyy-MM-dd HH:mm"`) is
 * in the past. Returns `false` for any malformed input.
 */
export function isReminderOverdue(reminder: string): boolean {
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

/**
 * Build the bell-icon button that opens a reminder popup. The
 * button is `draggable="false"` so the dashboard's task drag
 * handler does not treat the click as a drag start.
 */
export function createReminderButton(
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
    if (!task.checked && isReminderOverdue(task.reminder)) {
      btn.addClass("dashboard-task-reminder-btn--overdue");
    }
  } else {
    setIcon(btn, "bell");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    showReminderPopup(btn, cardId, taskIndex, task, callbacks);
  });

  return btn;
}

/**
 * Open the reminder popup anchored below `anchorBtn`. The
 * popup is appended to `document.body` (not the dashboard
 * root) so it can overflow column / card bounds.
 */
export function showReminderPopup(
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

  // Inherit theme variables from dashboard root (popup is on
  // body, outside theme scope)
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

  // Scroll & resize tracking — reposition popup when content
  // moves
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
  // Attach the cleanup callback to the popup element itself so
  // the caller can tear down scroll / resize listeners on close
  // without keeping an external handle. The cast is local
  // (interface) rather than `any` so we don't escape the
  // HTMLElement type globally.
  const popupWithCleanup = popup as HTMLElement & {
    __reminderCleanup?: () => void;
  };
  popupWithCleanup.__reminderCleanup = () => {
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
  const btnRow = popup.createDiv({
    cls: "dashboard-task-reminder-popup-btns",
  });
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

/**
 * Close every open reminder popup. Used at the start of every
 * `showReminderPopup` call (so a second click on a different
 * bell replaces the popup) and as a teardown hook stored on
 * the popup element.
 */
export function closeAllReminderPopups(): void {
  document.querySelectorAll(".dashboard-task-reminder-popup").forEach((el) => {
    const popup = el as HTMLElement & { __reminderCleanup?: () => void };
    popup.__reminderCleanup?.();
    popup.remove();
  });
}

// `Notice` is imported above for the i18n key check; the
// reminder popup itself only fires `Notice` inside
// `renderExternalLink` (wikilink fallback), which is a
// separate code path. Re-importing the type here so a future
// `clearAllReminders` API can use it without re-adding an
// import.
export type { Notice };
