/**
 * src/render/dashboard/card-bodies/memo.ts
 *
 * Memo column body renderer. Memo cards are essentially
 * multi-line text blocks that the user can edit in place
 * (textarea toggled by clicking the rendered view) and that
 * persist to the data file on a 400 ms autosave debounce.
 *
 * **Why a separate file**: memo is one of the 4 column
 * `sectionType`s and has its own body renderer. It also has
 * a distinct save pipeline (debounced autosave + optimistic
 * re-render) that does not apply to task / project / weather
 * / tracker cards. Splitting it out lets the rest of the
 * render-card dispatcher stay small (~80 lines).
 *
 * **Behaviour preservation**: the autosave debounce, the
 * view↔textarea toggle, the bullet-prefix round-trip, the
 * blockquote (`> `) syntax, the empty-state CSS class, and
 * every file-suggest hook are preserved verbatim. The save
 * error path still flips `dirty = true` and shows a
 * `Notice`.
 *
 * **Note**: `renderNoteBody` and `renderLinkBody` (singular
 * noun "note" / "link" card types) also live here because
 * they are memo-flavored and used only inside this file's
 * sibling callers in `renderCard`. They share no state with
 * memo; they are kept in the same module purely to avoid
 * creating a 30-line file just for them.
 */

import { App, Notice } from "obsidian";
import type { DashboardCard, RenderCallbacks } from "../../../types";
import { t } from "../../../i18n";
import { attachFileSuggest } from "../../../file-suggest";
import { renderInlineMarkdown } from "../../wikilink-inline";
import { stripBulletPrefix, addBulletPrefix } from "../../bullet-utils";

// Bullet helpers (`stripBulletPrefix` / `addBulletPrefix`) live
// in `../../bullet-utils`. The task body (in `todo.ts`) and the
// memo body (in this file) share the same checklist-marker
// convention, so the helpers are kept in a dedicated module
// instead of being duplicated in either card body.

/**
 * Render a memo card's body. Two DOM subtrees are created:
 *   1. A "view" element that renders the memo as inline
 *      markdown (wikilinks, bold, etc.). Clicking the view
 *      toggles it to edit mode.
 *   2. A `<textarea>` for editing. Hidden by default; shown
 *      on view click. `input` events trigger a 400 ms
 *      autosave debounce; `blur` forces a save and switches
 *      back to view mode.
 */
export function renderMemoBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  sourcePath?: string,
): void {
  const rawText = [card.blockquote, card.body].filter(Boolean).join("\n");
  const text = stripBulletPrefix(rawText);
  let dirty = false;
  let autosaveTimer: number | null = null;

  // View mode: rendered text with clickable links
  const view = container.createDiv({ cls: "dashboard-memo-view" });
  renderMemoViewContent(view, text, app, sourcePath);
  view.addEventListener("click", () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    view.style.display = "none";
    textarea.style.display = "";
    textarea.focus();
  });

  // Edit mode: textarea (hidden by default)
  const textarea = container.createEl("textarea", {
    cls: "dashboard-memo-textarea",
    text: text,
    attr: { placeholder: t("renderer.writeThoughts") },
  });
  textarea.style.display = "none";

  attachFileSuggest(textarea, app);

  const clearAutosaveTimer = (): void => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  };

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    dirty = false;
    const value = addBulletPrefix(textarea.value);
    const lines = value.split("\n");
    const quoteLines: string[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("> ")) {
        quoteLines.push(line.slice(2));
      } else {
        bodyLines.push(line);
      }
    }

    try {
      await callbacks.onMemoUpdate(card, {
        body: bodyLines.join("\n").trim(),
        blockquote: quoteLines.join("\n"),
      });
      return true;
    } catch {
      dirty = true;
      new Notice(t("noteDash.saveError"));
      return false;
    }
  };

  textarea.addEventListener("input", () => {
    dirty = true;
    clearAutosaveTimer();
    autosaveTimer = window.setTimeout(() => {
      void save();
    }, 400);
  });

  textarea.addEventListener("blur", () => {
    clearAutosaveTimer();
    void (async () => {
      const saved = await save();
      if (saved && document.body.contains(view)) {
        renderMemoViewContent(view, textarea.value, app, sourcePath);
        view.style.display = "";
        textarea.style.display = "none";
      }
    })();
  });
}

/**
 * Render the "view" subtree of a memo card. Walks the text
 * line by line: lines starting with `> ` become a quote
 * block, everything else flows into the container via the
 * inline markdown renderer.
 */
export function renderMemoViewContent(
  container: HTMLElement,
  text: string,
  app: App,
  sourcePath?: string,
): void {
  container.empty();
  if (!text) {
    container.addClass("dashboard-memo-view--empty");
    container.setText(t("renderer.writeThoughts"));
    return;
  }
  container.removeClass("dashboard-memo-view--empty");

  const resolvedSource =
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) container.createEl("br");
    const line = lines[i]!;
    if (line.startsWith("> ")) {
      const quote = container.createDiv({ cls: "dashboard-note-quote" });
      renderInlineMarkdown(quote, line.slice(2), app, resolvedSource);
    } else {
      renderInlineMarkdown(container, line, app, resolvedSource);
    }
  }
}

/**
 * Note card body: optional blockquote on top, body line
 * below. Used by the small "note" snippet variant that the
 * parser produces for `> ` style cards. No interactivity.
 */
export function renderNoteBody(
  container: HTMLElement,
  card: DashboardCard,
): void {
  if (card.blockquote) {
    const quote = container.createDiv({ cls: "dashboard-note-quote" });
    quote.setText(card.blockquote);
  }
  if (card.body) {
    container.createDiv({ cls: "dashboard-note-body", text: card.body });
  }
}

/**
 * Link card body: an external `<a target="_blank">` plus an
 * optional description. The dashboard parses cards with
 * `[label](url)` syntax into this shape.
 */
export function renderLinkBody(
  container: HTMLElement,
  card: DashboardCard,
): void {
  const link = container.createEl("a", {
    cls: "dashboard-link-url",
    attr: { href: card.url, target: "_blank", rel: "noopener" },
    text: card.url,
  });
  if (card.body) {
    container.createDiv({ cls: "dashboard-link-desc", text: card.body });
  }
}
