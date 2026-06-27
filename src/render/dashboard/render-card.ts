/**
 * src/render/dashboard/render-card.ts
 *
 * Single-card renderer + dispatcher for the dashboard. The
 * v1.5.0 refactor (Step 8.8.0B.4.4) split these two functions
 * out of `renderer.ts` so the renderer barrel can shrink
 * further (target < 30 lines) and so the per-card chrome
 * (header / actions / body dispatch) can evolve independently
 * of the column / section logic.
 *
 * **Module surface**:
 *   - `renderCard`     — builds the card DOM (header, actions,
 *                        body, drag-and-drop, resize handle) and
 *                        delegates the body to `renderCardBody`
 *   - `renderCardBody` — dispatches to the right
 *                        `card-bodies/*` renderer based on
 *                        `card.type` and `sectionType`
 *
 * **Behaviour preservation**: function bodies are byte-for-byte
 * copies of the pre-refactor `renderer.ts:807-1246`. The only
 * changes are the import paths (now pointing at the
 * `card-bodies/*` sub-modules and `render/section-title`).
 *
 * **Why these are coupled**: `renderCard` is only ever called
 * by `renderSection` (in `./render-section.ts`), and
 * `renderCardBody` is only ever called by `renderCard`. They
 * live in the same file because:
 *   - They share the same `defaultHide` / `hideCompletedResolved`
 *     computation.
 *   - They share the same set of section-type booleans
 *     (`isMemo`, `isTask`, `isProjectLike`, `isWidget`).
 *   - The `dragState` import lives in `renderCard` and is
 *     shared with the body-renderer dispatch path.
 */
import { Menu, setIcon, type App } from "obsidian";
import { t } from "../../i18n";
import type {
  CardSize,
  DashboardCard,
  DashboardData,
  DashboardSettings,
  RenderCallbacks,
} from "../../types";
import { showConfirmDialog } from "../../confirm-dialog";
import { renderInlineMarkdown } from "../wikilink-inline";
import { dragState } from "../state";
import { renderMemoBody } from "./card-bodies/memo";
import { renderProjectBody } from "./card-bodies/projects";
import { renderTaskBody } from "./card-bodies/todo";
import { renderWeatherBody } from "./card-bodies/weather";
import { renderTrackerBody } from "./card-bodies/tracker";
import { renderTodoPlusBody } from "./card-bodies/todoplus";

/**
 * Builds the DOM for a single card and delegates the body to
 * `renderCardBody`. The header chrome (title, actions, drag
 * handle, color button, eye toggle, delete button) is owned
 * here; the body lives in the `card-bodies/*` sub-modules.
 *
 * **Card chrome rules** (unchanged from pre-refactor):
 *   - Memo / Task / Project: stretchable width with a resize
 *     handle in the bottom-right corner (200-600px range).
 *   - Widget (weather / tracker) in a "dashboard" section:
 *     grid layout with an S/M/L size button; the card spans
 *     `1x1` (S), `2x1` (M), or `2x2` (L) cells of the
 *     `.dashboard-section-cards` grid.
 *   - Project-like cards in a non-notes / non-dashboard
 *     section: top accent line (uses `card.color` if set).
 *   - Memo cards: right-click header → "Convert to note"
 *     action (calls `callbacks.onMemoConvertToNote`).
 */
export function renderCard(
  card: DashboardCard,
  columnName: string,
  sectionType: string,
  callbacks: RenderCallbacks,
  app: App,
  data?: DashboardData,
  settings?: DashboardSettings,
  // v1.4.x R5 — dashboard host file path. Threaded down through
  // `renderCardBody` so wikilink hover preview resolves against
  // the dashboard's host file rather than the user's active leaf.
  sourcePath?: string,
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

  // Right-click on a Memo card header: surface the "Convert to note"
  // action. The original Memo card is preserved — the new note is
  // created in Obsidian's default new-file location by the view
  // callback (see `onMemoConvertToNote` in view.ts).
  if (isMemo) {
    header.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle(t("memo.convertToNote"))
          .setIcon("file-plus")
          .onClick(() => {
            void callbacks.onMemoConvertToNote(card);
          }),
      );
      menu.showAtMouseEvent(e);
    });
  }

  const titleEl = header.createEl("h4", { cls: "dashboard-card-title" });
  try {
    renderInlineMarkdown(titleEl, card.title, app, sourcePath);
    if (
      titleEl.querySelector(".dashboard-wikilink, .dashboard-external-link")
    ) {
      titleEl.addClass("dashboard-card-title--linked");
    }
  } catch {
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
          renderInlineMarkdown(titleEl, originalTitle, app, sourcePath);
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
      attr: {},
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
      attr: {},
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
      attr: {},
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
      attr: { "aria-pressed": hideCompleted ? "true" : "false" },
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
    attr: {},
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
    sourcePath,
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
        e.dataTransfer.dropEffect = dragState.projectItemDragSource
          ? "move"
          : "copy";
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
      if (dragState.projectItemDragSource) {
        if (dragState.projectItemDragSource.cardId === card.id) return;
        e.stopPropagation();
        const numItems = card.body
          ? card.body
              .split("\n")
              .filter(
                (l) => l.trim() && (l.match(/^(\t*)/)?.[1]?.length ?? 0) === 0,
              ).length
          : 0;
        callbacks.onProjectItemMoveToCard(
          dragState.projectItemDragSource.cardId,
          dragState.projectItemDragSource.itemIndex,
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

/**
 * Dispatches a card body to the right
 * `render/dashboard/card-bodies/*` renderer based on
 * `card.type` and `sectionType`. Section type takes priority
 * over the in-memory `card.type` field — see the v1.4.9
 * BUG-003a rationale comment for why trusting a stale
 * `card.type` was the original bug.
 *
 * **Dispatch order** (unchanged from pre-refactor):
 *   1. `card.type === "weather"`     → `renderWeatherBody`
 *   2. `card.type === "tracker"`     → `renderTrackerBody`
 *   3. `card.type === "todoplus"`    → `renderTodoPlusBody`
 *   4. `sectionType === "todo"` /
 *      `sectionType === "todoplus"`  → `renderTaskBody`
 *      (regular task list; for todoplus cards, the body in
 *      step 3 has already returned, so this only matches
 *      plain task cards)
 *   5. `sectionType === "memo"`      → `renderMemoBody`
 *   6. fallback                      → `renderProjectBody`
 */
export function renderCardBody(
  container: HTMLElement,
  card: DashboardCard,
  columnName: string,
  sectionType: string,
  callbacks: RenderCallbacks,
  app: App,
  data?: DashboardData,
  settings?: DashboardSettings,
  // v1.4.x R5 — dashboard host file path. Threaded to all body
  // renderers so wikilink hover preview uses the *dashboard*'s
  // host path (not `getActiveFile()`) as the link-resolution
  // source. See `renderDashboard` for the full rationale.
  sourcePath?: string,
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
  void columnName; // unused here; kept for symmetry with the rest of
  // the render pipeline.

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
    void renderTodoPlusBody(
      container,
      card,
      callbacks,
      app,
      settings,
      sourcePath,
    );
    return;
  }

  const isMemo = sectionType === "memo";
  // sectionType is the single source of truth for which body
  // renderer to use. We deliberately drop the historical
  // `card.type === "task"` short-circuit: a card in a memo / projects
  // column can still have `type: "task"` if it was migrated from a
  // previous todo column and the in-memory snapshot was not refreshed
  // (the v1.4.9 BUG-003a fix renders with the post-mutation data,
  // but the per-card `type` is still the old value). Honoring the
  // card's stale type here caused the "switch todo→projects keeps the
  // checkboxes" bug. Trust the column's sectionType; the switch
  // callback in view.ts migrates `card.type` to match.
  const isTaskCard = sectionType === "todo" || sectionType === "todoplus";

  if (isTaskCard) {
    renderTaskBody(
      container,
      card,
      callbacks,
      app,
      hideCompletedResolved,
      sourcePath,
    );
    return;
  }

  if (isMemo) {
    renderMemoBody(container, card, callbacks, app, sourcePath);
    return;
  }

  // All non-memo, non-task cards render as project body
  renderProjectBody(container, card, callbacks, app, sourcePath);
}
