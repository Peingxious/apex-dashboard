/**
 * src/render/dashboard/card-bodies/todoplus/render-body.ts
 *
 * The outer renderer for a TodoPlus card body. Wires together
 * `parse.ts` (source-link parser), `slice.ts` (file + heading
 * resolver), `io.ts` (file writers), `render-item.ts`
 * (per-item DOM), and `refresh.ts` (reactive watcher).
 *
 * This is the function that the card-body dispatcher in
 * `renderer.ts` (`renderCardBody`) calls when `card.type ===
 * "todoplus"` — it used to live at the top of
 * `renderer.ts:4456-4680` in the pre-refactor v1.4.12 codebase
 * and was inadvertently removed during one of the earlier
 * refactor passes. Restoring it here closes the tsc error
 * cluster (`Cannot find name 'renderTodoPlusBody'`) and brings
 * the todoplus UI back online.
 *
 * **Behaviour preservation**: the function body is a
 * byte-for-byte copy of the pre-refactor implementation in
 * `renderer.ts:4456-4680`. Only the import paths were
 * rewritten to point at the new sub-modules; the control flow
 * and DOM construction are unchanged.
 */
import { Notice, TFile, type App } from "obsidian";
import { t } from "../../../../i18n";
import { attachFileSuggest } from "../../../../file-suggest";
import type {
  DashboardCard,
  DashboardSettings,
  RenderCallbacks,
} from "../../../../types";
import { addTodoPlusItem, ensureTodoPlusHeading } from "./io";
import { promptTodoPlusSourceLink } from "./modals";
import {
  getTodoPlusSourceLinkFromTitle,
  parseTodoPlusSourceLink,
} from "./parse";
import { renderTodoPlusItem } from "./render-item";
import { resolveTodoPlusSlice } from "./slice";
import { scheduleTodoPlusRefresh } from "./refresh";
import { todoPlusRenderGeneration } from "../../../state";

/**
 * Render the TodoPlus card body inside `container`. The full
 * pipeline is:
 *
 *   1. Read the source link from `card.title`
 *      (`getTodoPlusSourceLinkFromTitle` in `./parse.ts`).
 *   2. Resolve it to a `TodoPlusSlice`
 *      (`resolveTodoPlusSlice` in `./slice.ts`).
 *   3. Render each item via `renderTodoPlusItem`
 *      (`./render-item.ts`).
 *   4. Wire the "add task" input to `addTodoPlusItem`
 *      (`./io.ts`).
 *   5. Schedule the reactive refresh
 *      (`scheduleTodoPlusRefresh` in `./refresh.ts`).
 *
 * The per-card render generation counter
 * (`todoPlusRenderGeneration` in `src/render/state.ts`)
 * short-circuits in-flight async work whenever the card is
 * re-rendered before a previous render finished (e.g. the
 * user adds a task while the source file is still being
 * indexed).
 */
export async function renderTodoPlusBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  settings?: DashboardSettings,
  // v1.4.x R5 — dashboard host file path, threaded to
  // `renderTodoPlusItem` so wikilink hover preview resolves
  // against the *dashboard*'s file rather than whatever the
  // user's active leaf happens to be.
  sourcePath?: string,
): Promise<void> {
  const nextGen = (todoPlusRenderGeneration.get(card.id) ?? 0) + 1;
  todoPlusRenderGeneration.set(card.id, nextGen);
  container.empty();

  // The source link is read from the card's `title` (a
  // wikilink of the form `[[note#heading]]`); there is no
  // per-card `sourceLink` field anymore — see
  // `getTodoPlusSourceLinkFromTitle` in `./parse.ts`.
  const sourceLink = getTodoPlusSourceLinkFromTitle(card);
  if (!sourceLink) {
    // No source set yet — show a one-click hint to wire it
    // up. (This path is rare: the add-card flow validates
    // the source link before creating the card, so the
    // placeholder only appears if a TodoPlus card was
    // somehow created with an empty source.)
    const empty = container.createDiv({ cls: "dashboard-todoplus-empty" });
    empty.setText(t("renderer.todoPlusEmpty"));
    const setBtn = empty.createEl("button", {
      cls: "dashboard-todoplus-set-btn",
      text: t("renderer.todoPlusSetSource"),
    });
    setBtn.addEventListener("click", () => {
      void promptTodoPlusSourceLink(card, callbacks, app, settings);
    });
    return;
  }

  // Resolve the source file + heading slice. We render an
  // empty-state message in the body if the link can't be
  // resolved (broken link, missing file, etc.) so the user
  // has clear feedback.
  //
  // We may need to wait for the metadata cache to index the
  // source file (it can be empty / incomplete right after
  // Obsidian opens the file, or right after the user opens
  // the dashboard with a brand-new workspace).
  // `resolveTodoPlusSlice` handles that internally via
  // `waitForFileCache`, so this single call should be enough.
  let slice = await resolveTodoPlusSlice(app, sourceLink);
  if (todoPlusRenderGeneration.get(card.id) !== nextGen) return;

  // Belt-and-braces fallback: if the cache truly has no
  // `## To-do` heading (maybe the user just typed the link
  // but hasn't opened the file yet), give Obsidian one more
  // chance to catch up before we report an error.
  if (!slice) {
    await new Promise<void>((r) => setTimeout(r, 400));
    slice = await resolveTodoPlusSlice(app, sourceLink);
  }
  if (todoPlusRenderGeneration.get(card.id) !== nextGen) return;

  // Lazy auto-create: if the source file exists but doesn't
  // have the requested `## heading` yet, append it on the fly
  // so the card can render an empty checklist. This mirrors
  // the add-card flow and avoids a permanently-broken card
  // for a heading the user just typed (or one that was never
  // present in the source note). We show a brief "preparing"
  // placeholder while the write lands, then re-resolve once
  // and drop into the normal render path. If the source file
  // itself is missing, fall through to the unresolved error
  // below — we can't create a heading in a note that doesn't
  // exist.
  if (!slice) {
    const parsedLink = parseTodoPlusSourceLink(sourceLink);
    const sourceFile =
      parsedLink && app.metadataCache.getFirstLinkpathDest(parsedLink.path, "");
    if (parsedLink && sourceFile instanceof TFile) {
      const preparing = container.createDiv({
        cls: "dashboard-todoplus-preparing",
      });
      preparing.setText(
        t("renderer.todoPlusPreparing", { heading: parsedLink.heading }),
      );
      await ensureTodoPlusHeading(app, sourceFile, parsedLink.heading);
      if (todoPlusRenderGeneration.get(card.id) !== nextGen) return;
      slice = await resolveTodoPlusSlice(app, sourceLink);
      if (slice) {
        // Drop the placeholder; the rest of the function
        // rebuilds the body from scratch via
        // `container.createDiv` below.
        container.empty();
      }
    }
  }
  if (todoPlusRenderGeneration.get(card.id) !== nextGen) return;
  if (!slice) {
    const err = container.createDiv({ cls: "dashboard-todoplus-error" });
    err.setText(t("renderer.todoPlusUnresolved", { link: sourceLink }));
    return;
  }

  // Same hide-completed resolution the regular Todo body
  // uses:
  //   1. The card's in-memory `hideCompleted` override wins
  //      when set.
  //   2. Otherwise fall back to the global
  //      `defaultHideCompleted` setting (default true).
  // (The v1.4.5 column-level `columnHideCompleted` was
  // removed in v1.4.6: the section-level button is now an
  // "archive completed cards" toggle, not an item-level
  // filter override.)
  const defaultHide = settings?.defaultHideCompleted ?? true;
  const hideCompleted = card.hideCompleted ?? defaultHide;
  // Always compute the progress from the full item list, not
  // the filtered one — hiding completed tasks should not
  // change the percentage the user sees.
  const visibleItems = hideCompleted
    ? slice.items.filter((it) => !it.checked)
    : slice.items;

  // Build the checklist using the **same DOM classes** as
  // `renderTaskBody` so the CSS, the drag-handle expectations,
  // and any future shared styles Just Work. The only
  // divergence is that TodoPlus items aren't `draggable`
  // (reordering would mean rewriting the source file
  // mid-drag, which the user didn't ask for, so we leave that
  // as a follow-up if needed).
  const list = container.createDiv({ cls: "dashboard-task-list" });
  list.dataset.cardId = card.id;
  list.dataset.todoplus = "true";
  list.dataset.todoplusFile = slice.file.path;
  list.dataset.todoplusHeading = slice.heading;

  if (visibleItems.length === 0) {
    const empty = list.createDiv({ cls: "dashboard-task-empty" });
    empty.setText(t("renderer.todoPlusNoItems"));
  } else {
    visibleItems.forEach((item, idx) => {
      renderTodoPlusItem(list, card, slice, item, idx, app, sourcePath);
    });
  }

  // Add-row: identical input UX to a regular Todo card.
  // Pressing Enter (or picking from the file-suggest
  // dropdown) writes `- [ ] <text>` to the end of the heading
  // slice in the source file via `addTodoPlusItem`. The
  // metadataCache `changed` event fires, our
  // `scheduleTodoPlusRefresh` listener catches it, and the
  // new item appears in the list — no extra refresh wiring.
  const addRow = container.createDiv({ cls: "dashboard-task-add" });
  const input = addRow.createEl("input", {
    cls: "dashboard-task-input",
    attr: { type: "text", placeholder: t("renderer.addTask") },
  });
  const submitNew = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    void addTodoPlusItem(app, slice.file, slice.heading, value).catch((e) => {
      new Notice(
        t("renderer.todoPlusWriteError", { message: (e as Error).message }),
      );
    });
  };
  const taskSuggest = attachFileSuggest(input, app, (value) => {
    // `value` here is the REPLACED input content (any
    // leading prefix the user typed before `[[` is preserved,
    // and the picked file's basename has been written in as
    // `[[basename]]`). Mirrors the regular Todo behaviour:
    // keep the user's prefix intact rather than collapsing
    // the row to just the wikilink.
    submitNew(value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    // If the suggest popup has an active selection, Enter
    // means "pick it", not "submit my current text". The
    // handle takes care of the side effects (writing the
    // wikilink into the input + calling the onPick callback
    // above), so we just suppress the default submit.
    if (e.key === "Enter" && taskSuggest.tryPickSelection()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      submitNew(input.value);
      input.value = "";
    }
  });

  // Progress bar: same DOM as `renderTaskBody`, computed
  // from the full item list (not the filtered one) so hiding
  // completed tasks doesn't move the percentage.
  if (slice.items.length > 0) {
    const checkedCount = slice.items.filter((it) => it.checked).length;
    const total = slice.items.length;
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

  // Reactive refresh: when the source file changes (user
  // adds a task in dash002, toggles a checkbox, renames the
  // heading, etc.), re-render this card's body. We register
  // a `metadataCache.on("changed")` listener scoped to the
  // source file and tear it down automatically when the card
  // leaves the DOM (via MutationObserver on its parent).
  // This keeps the dashboard in sync with the source note
  // in real time, no reload required.
  scheduleTodoPlusRefresh(app, list, card, callbacks, settings);
  return;
}
