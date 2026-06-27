/**
 * src/render/dashboard/card-bodies/todoplus/render-item.ts
 *
 * Renders a single TodoPlus checklist item. The DOM mirrors a
 * regular Todo item (`.dashboard-task-item` + checkbox + text
 * + delete button) so the styling, the hover-revealed delete,
 * and any future task-list styles apply uniformly.
 *
 * The three user actions (toggle, edit, delete) all write back
 * to the source file via the `*TodoPlusItem` helpers in
 * `../io.ts` — there is no in-memory copy of the checklist on
 * the dashboard card. The `metadataCache.on("changed")`
 * listener scheduled by `./refresh.ts` will fire after the
 * write and re-render the card body, so the user sees the new
 * state without any extra wiring here.
 *
 * **Behaviour preservation**: the function body is a
 * byte-for-byte copy of the pre-refactor implementation in
 * `renderer.ts:4682-4798`. Only the module location changed;
 * no logic was rewritten.
 */
import { Notice, setIcon, type App } from "obsidian";
import { t } from "../../../../i18n";
import { renderInlineMarkdown } from "../../../wikilink-inline";
import type { DashboardCard } from "../../../../types";
import { editTodoPlusItem, removeTodoPlusItem, setTodoPlusItemChecked } from "./io";
import type { TodoPlusChecklistItem, TodoPlusSlice } from "./types";

/**
 * Render one TodoPlus checklist item inside `list`. The DOM
 * mirrors a regular Todo item (`.dashboard-task-item` +
 * checkbox + text + delete button). The `idx` parameter is
 * unused at the moment (it used to drive a `data-task-index`
 * attribute for the drag handler) but kept in the signature
 * for source compatibility with the pre-refactor call site
 * (`renderTodoPlusBody` passes the loop index).
 */
export function renderTodoPlusItem(
  list: HTMLElement,
  card: DashboardCard,
  slice: TodoPlusSlice,
  item: TodoPlusChecklistItem,
  _idx: number,
  app: App,
  sourcePath?: string,
): void {
  const resolvedSource =
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "";
  const li = list.createDiv({ cls: "dashboard-task-item" });
  // Intentionally NOT `draggable="true"` — reordering would
  // mean rewriting the source file mid-drag, and the user did
  // not ask for that. Add later if requested.
  li.dataset.todoplusItem = "true";

  const checkbox = li.createEl("input", {
    cls: "dashboard-task-checkbox",
    attr: { type: "checkbox" },
  });
  checkbox.checked = item.checked;
  checkbox.addEventListener("change", () => {
    const newChecked = checkbox.checked;
    void setTodoPlusItemChecked(app, slice.file, item, newChecked).catch(
      (e) => {
        new Notice(
          t("renderer.todoPlusWriteError", { message: (e as Error).message }),
        );
      },
    );
  });

  const label = li.createSpan({
    cls: item.checked
      ? "dashboard-task-text dashboard-task-text--done"
      : "dashboard-task-text",
  });
  renderInlineMarkdown(label, item.text, app, resolvedSource);
  label.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    label.empty();

    const textarea = label.createEl("textarea", {
      cls: "dashboard-task-edit-textarea",
      text: item.text,
    });

    // Auto-size: fit content and expand as the user types.
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    };
    autoResize();

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const finish = (save: boolean) => {
      const newText = textarea.value.trim();
      if (save && newText && newText !== item.text) {
        void editTodoPlusItem(app, slice.file, item, newText).catch((err) => {
          new Notice(
            t("renderer.todoPlusWriteError", {
              message: (err as Error).message,
            }),
          );
        });
      } else {
        label.empty();
        try {
          renderInlineMarkdown(label, item.text, app, resolvedSource);
        } catch {
          label.setText(item.text);
        }
      }
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

  const delBtn = li.createEl("button", {
    cls: "dashboard-task-delete",
    attr: {},
  });
  setIcon(delBtn, "x");
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void removeTodoPlusItem(app, slice.file, item).catch((err) => {
      new Notice(
        t("renderer.todoPlusWriteError", { message: (err as Error).message }),
      );
    });
  });
}
