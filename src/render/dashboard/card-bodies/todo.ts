/**
 * src/render/dashboard/card-bodies/todo.ts
 *
 * Task-list card body renderer. The "todo" section type
 * renders cards whose `card.type === "task"` (and any
 * migrated task card) as a draggable checkbox list with an
 * add-row at the bottom and a progress bar.
 *
 * **Why a separate file**: task body is the largest single
 * card body (~210 lines) and the most interactive (drag,
 * checkbox toggle, double-click edit, reminder popup, file
 * suggest). Keeping it isolated means the dispatcher
 * `renderCardBody` and the rest of the card body modules
 * stay small and focused.
 *
 * **Behaviour preservation**:
 *   - Drag wiring still calls
 *     `dragState.taskItemCallbacks = callbacks` +
 *     `installDocumentDragListeners()` (idempotent — LEAK-001
 *     fix is preserved).
 *   - Hidden-completed filter uses the `hideCompletedResolved`
 *     value resolved by `renderCardBody`; the legacy
 *     `card.hideCompleted === true` fallback path is intact.
 *   - Double-click edit flow: textarea swap → autosize on
 *     input → Enter saves / Esc cancels → blur saves. The
 *     `draggable` flag is toggled on the parent `<li>` to
 *     prevent the drag handler from interfering with text
 *     selection.
 *   - Mobile touch toggle (`dashboard-task-item--touched`)
 *     is preserved so action buttons (delete, reminder) are
 *     reachable on touch devices.
 *   - Add-row at the bottom uses `attachFileSuggest` so
 *     typing `[[foo]]` resolves to a wikilink; the picked
 *     `value` (with the user's prefix preserved) is sent
 *     back via `onTaskAdd`.
 *   - Progress bar (checked / total) is appended at the
 *     bottom for any card with at least one task.
 */

import { App, setIcon } from "obsidian";
import type { DashboardCard, RenderCallbacks } from "../../../types";
import { t } from "../../../i18n";
import { attachFileSuggest } from "../../../file-suggest";
import { renderInlineMarkdown } from "../../wikilink-inline";
import { dragState } from "../../state";
import { installDocumentDragListeners } from "../../drag-and-drop";
import { createReminderButton } from "../../reminder-popup";

/**
 * Render a task-list card body into `container`.
 *
 * @param hideCompletedResolved  The effective "hide completed"
 *   toggle. Resolved by `renderCardBody` from
 *   `card.hideCompleted` + `settings.defaultHideCompleted`.
 *   Undefined falls back to the legacy in-memory check.
 */

// Bullet helpers (`stripBulletPrefix` / `addBulletPrefix`) live in
// `../../bullet-utils`. The task body and the memo body share the
// same checklist-marker convention, so the helpers are kept in a
// dedicated module instead of being duplicated in either card body.
// `renderTaskBody` does not call them directly today, but they
// are the documented contract for any future round-trip of a task
// card's text into a checklist-aware textarea.

export function renderTaskBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  hideCompletedResolved?: boolean,
  sourcePath?: string,
): void {
  dragState.taskItemCallbacks = callbacks;
  installDocumentDragListeners();
  const resolvedSource =
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "";

  const list = container.createDiv({ cls: "dashboard-task-list" });
  list.dataset.cardId = card.id;

  // Filter hidden completed tasks. We still keep the
  // original index mapping for callbacks so uncheck/redo
  // keeps the same checkbox state; filteredOut tracks the
  // indices we skipped so `onCheckboxToggle` still receives
  // the correct source index.
  //
  // `hideCompletedResolved` is the global-default +
  // in-memory-override resolution computed in
  // `renderCardBody`. If a caller passes `undefined` (e.g.
  // a future path that doesn't go through the dashboard
  // renderer), fall back to the legacy in-memory-only
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
    renderInlineMarkdown(label, task.text, app, resolvedSource);
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
            renderInlineMarkdown(label, task.text, app, resolvedSource);
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
      attr: {},
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
    // `value` is the REPLACED input content (any leading
    // text the user typed before `[[` is preserved, and the
    // picked file's basename has been written in as
    // `[[basename]]`). Using it as the task title — instead
    // of just the file's wikilink — keeps the user's prefix
    // intact, e.g. typing "review " then picking "Foo.md"
    // produces a task of "review [[Foo]]", not just "[[Foo]]"
    // (the "don't replace my content" requirement).
    callbacks.onTaskAdd(card.id, value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && taskSuggest.tryPickSelection()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && input.value.trim()) {
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
