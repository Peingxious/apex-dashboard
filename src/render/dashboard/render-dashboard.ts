/**
 * src/render/dashboard/render-dashboard.ts
 *
 * Top-level dashboard renderer. The v1.5.0 refactor (Step
 * 8.8.0B.4.6) moved `renderDashboard` from `renderer.ts` to
 * this file. The barrel `src/renderer.ts` now re-exports it so
 * `view.ts` / `sidebar-view.ts` keep their original
 * `import { renderDashboard } from "./renderer"` import path
 * (the public API contract is unchanged).
 *
 * **Module surface**:
 *   - `renderDashboard` — top-level entry point. Empty the
 *     container, attach `.dashboard-kanban`, sequentially
 *     render every column via `renderSection` (the column /
 *     card sub-renderer), and append the "Add section" row
 *     at the bottom (the inline input + section-type picker
 *     that the user uses to create new columns).
 *
 * **Behaviour preservation**: the function body is a
 * byte-for-byte copy of the pre-refactor `renderer.ts:208-345`
 * (the `renderDashboard` function). The only changes are:
 *   - imports rewritten to point at the new sub-modules
 *     (`./render-section` for the column renderer,
 *     `../../i18n` for the `t()` strings, `../../types` for
 *     the `DashboardData` / `RenderCallbacks` /
 *     `DashboardSettings` types).
 *   - the doc-comment block updated to reflect the new
 *     location.
 *
 * **Why this lives at the top of the `dashboard/*` tree**:
 * `renderDashboard` orchestrates the column-level renderer
 * (`renderSection` in `./render-section`) and indirectly
 * the per-card renderer (`renderCard` in `./render-card`).
 * Putting it here keeps the import graph one-way (top-down)
 * and lets `renderer.ts` shrink to a thin re-export barrel.
 */
import { setIcon, type App } from "obsidian";
import { t } from "../../i18n";
import type {
  DashboardData,
  RenderCallbacks,
  DashboardSettings,
} from "../../types";
import { renderSection } from "./render-section";

/**
 * Top-level dashboard renderer. Wipes the container, then
 * renders every column sequentially (the auto-archive filter
 * is async since v1.4.6 — see `isCardAllCompleted` in
 * `./render-section`), then attaches the "Add section" row
 * at the bottom.
 *
 * @param container  The DOM element to render into. Typically
 *                   the kanban `<div>` created by `view.ts` /
 *                   `sidebar-view.ts`.
 * @param data       The dashboard data (columns + cards)
 *                   parsed from the host file's frontmatter.
 * @param callbacks  The `RenderCallbacks` instance the host
 *                   view registered — used here to delegate
 *                   `onColumnAdd` (and indirectly
 *                   `onColumnRename`, `onColumnDelete`, etc.,
 *                   all of which flow through the per-card /
 *                   per-section DOM listeners).
 * @param app        The Obsidian `App` instance.
 * @param settings   Optional `DashboardSettings` snapshot.
 *                   Threaded to the section renderer so the
 *                   per-section toggles (e.g. "archive
 *                   completed cards") read the current setting.
 * @param sourcePath Optional. The path of the note that hosts
 *                   this dashboard view. v1.4.x R5: threaded
 *                   all the way down to `renderWikilink` so
 *                   the native Page Preview resolves wikilinks
 *                   relative to the *dashboard host file*, not
 *                   to whatever markdown file is currently the
 *                   active leaf in the user's workspace.
 *                   Without this, hovering a wikilink in a
 *                   sidebar / embedded dashboard while a
 *                   different markdown is open in the main pane
 *                   would either fail to resolve the link or
 *                   resolve it against the wrong file — making
 *                   the preview pop-up show the link's display
 *                   text instead of the actual file content.
 */
export async function renderDashboard(
  container: HTMLElement,
  data: DashboardData,
  callbacks: RenderCallbacks,
  app: App,
  settings?: DashboardSettings,
  sourcePath?: string,
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
    const section = await renderSection(
      column,
      callbacks,
      app,
      data,
      settings,
      sourcePath,
    );
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
      attr: {},
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
