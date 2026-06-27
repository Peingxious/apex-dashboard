/**
 * src/render/dashboard/card-bodies/todoplus/modals.ts
 *
 * User-prompt entry points for the TodoPlus card body:
 *   - `promptTodoPlusSourceLink`  — `window.prompt` modal that
 *     asks the user for a `note#heading` source link
 *   - `openTodoPlusNoteSearchModal` — vault-wide note picker
 *     (`DocSearchModal`) for the column-header "+" button
 *   - `addTodoPlusCardFromNote`   — bridge from the picker
 *     into `onCardAdd`; auto-appends a `## To-do` heading on
 *     the fly
 *
 * **Re-export**: `ensureTodoPlusHeading` is re-exported here
 * so the existing import path
 * `import { ensureTodoPlusHeading } from
 *  "./render/dashboard/card-bodies/todoplus/modals"`
 * keeps working — `view.ts` and the pre-Step-8.5 callers all
 * went through the shim. After Step 8.5 the canonical home of
 * the function is `./io.ts`; this file just re-exports it for
 * backwards compatibility.
 *
 * **Behaviour preservation**: the function bodies are
 * byte-for-byte copies of the pre-refactor implementations in
 * `renderer.ts:5332-5462`. Only the module location changed
 * and the import paths were rewritten to point at the new
 * sub-modules; the control flow and DOM/modal usage are
 * unchanged.
 */
import { Notice, TFile, type App } from "obsidian";
import { t } from "../../../../i18n";
import { DocSearchModal } from "../../../../quick-actions";
import type {
  DashboardCard,
  DashboardColumn,
  DashboardSettings,
  RenderCallbacks,
} from "../../../../types";
import { ensureTodoPlusHeading } from "./io";
import {
  getTodoPlusSourceLinkFromTitle,
  parseTodoPlusSourceLink,
} from "./parse";

/**
 * Re-export the heading-ensure helper from `./io.ts` so the
 * pre-Step-8.5 import path (this file) still works for
 * `view.ts` and any third-party consumer.
 */
export { ensureTodoPlusHeading };

/**
 * Prompts the user to set / change the source link of a
 * TodoPlus card. The link is stored in the card's `title`
 * field (as a wikilink `[[note#heading]]`); there is no
 * separate per-card `sourceLink` field. We use a `prompt`
 * modal (matches the add-card flow) and write the result
 * through `onCardEdit`.
 */
export async function promptTodoPlusSourceLink(
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  _settings?: DashboardSettings,
): Promise<void> {
  // Prefill the prompt with the current source link (parsed
  // from the card title for display — strip the `[[ ]]` so
  // the user sees the canonical `note#heading` form).
  const currentSource = getTodoPlusSourceLinkFromTitle(card);
  const next = window.prompt(t("renderer.todoPlusPromptLabel"), currentSource);
  if (next === null) return; // cancelled
  const cleaned = next.trim();
  if (!cleaned) return;
  // Validate the link resolves to a real file.
  const parsed = parseTodoPlusSourceLink(cleaned);
  if (!parsed) {
    new Notice(t("renderer.todoPlusInvalidLink"));
    return;
  }
  const dest = app.metadataCache.getFirstLinkpathDest(parsed.path, "");
  if (!(dest instanceof TFile)) {
    new Notice(t("renderer.todoPlusFileNotFound", { path: parsed.path }));
    return;
  }
  // If the heading doesn't exist yet, append it (so the
  // user can start writing tasks immediately). Bail out if
  // the append failed — `ensureTodoPlusHeading` already
  // showed a Notice.
  const ok = await ensureTodoPlusHeading(app, dest, parsed.heading);
  if (!ok) return;
  // The source link is stored entirely in the card's
  // `title` (a wikilink). Wrap with `[[ ]]` if the user
  // gave a bare form so the header renders as a clickable
  // `[[note#heading]]` label.
  const titleWikilink = cleaned.startsWith("[[") ? cleaned : `[[${cleaned}]]`;
  callbacks.onCardEdit({ ...card, title: titleWikilink });
}

/**
 * Opens a vault-wide note search modal for the user to pick
 * a TodoPlus mirror source. This is the column-header "+"
 * entry point for `sectionType === "todoplus"`.
 *
 * The modal reuses the same `DocSearchModal` widget that the
 * Project section uses, so the user gets a single consistent
 * note-picker across the dashboard. The picked `TFile` is
 * handed off to `addTodoPlusCardFromNote`.
 *
 * Unlike the legacy wikilink-form input flow, this picker
 * does **not** require the target note to have a
 * `## To-do` heading beforehand — the heading is auto-created
 * on the fly inside `addTodoPlusCardFromNote`. The user can
 * also pick notes that aren't meant to be the mirror at all
 * and then cancel by closing the modal (no card is created
 * on cancel).
 */
export function openTodoPlusNoteSearchModal(
  column: DashboardColumn,
  callbacks: RenderCallbacks,
  app: App,
): void {
  // Defer the modal's auto-focus and the close-on-pick
  // contract by using a single-shot onSelect. We do NOT keep
  // a reference to the modal — the modal closes itself in
  // its own click handler (`DocSearchModal.onOpen`) and we
  // drive the add from the onSelect callback.
  const modal = new DocSearchModal(app, (link) => {
    // DocSearchModal hands us `{ name, path }` where `path`
    // is the vault-relative file path. Resolve it back to a
    // TFile so the heading-append step can work with a
    // concrete `TFile` (matches the rest of the TodoPlus
    // code).
    const dest = app.vault.getFileByPath(link.path);
    if (!(dest instanceof TFile)) {
      new Notice(t("renderer.todoPlusFileNotFound", { path: link.path }));
      return;
    }
    void addTodoPlusCardFromNote(column, dest, callbacks, app);
  });
  modal.open();
}

/**
 * Adds a new TodoPlus card to `column` mirroring the
 * `## To-do` checklist of `file`. The card's on-disk
 * identity is the wikilink title `[[file.basename#To-do]]`
 * (no per-card `type:` or `sourceLink:` metadata line — both
 * are derivable from the column's `sectionType` and the
 * title).
 *
 * If the picked note does not yet have a `## To-do` heading,
 * we append a fresh `## To-do` block to it via `vault.process`
 * so the new card has a real checklist to mirror immediately.
 * This is the "even if no `## To-do` exists, you can still
 * add" behaviour — the user is not blocked on a manual prep
 * step.
 *
 * The on-disk format mirrors a regular Todo card body:
 *   - [[note#To-do]]
 * plus its indented metadata (cover / width / size / grid).
 */
export async function addTodoPlusCardFromNote(
  column: DashboardColumn,
  file: TFile,
  callbacks: RenderCallbacks,
  app: App,
): Promise<void> {
  // The mirror heading we always target. The user can still
  // change this per-card via the "Set source" button (which
  // re-uses the same heading-create flow).
  const heading = "To-do";
  // If the picked note does not yet have a `## To-do`
  // heading, append a fresh `## To-do` block to it via
  // `vault.process` so the new card has a real checklist to
  // mirror immediately. This is the "even if no `## To-do`
  // exists, you can still add" behaviour — the user is not
  // blocked on a manual prep step. Bail out if the append
  // failed — `ensureTodoPlusHeading` already showed a
  // Notice.
  const ok = await ensureTodoPlusHeading(app, file, heading);
  if (!ok) return;
  // Build the canonical wikilink title the way every other
  // TodoPlus card does it: `[[note]]` (no `#To-do` fragment
  // — parseTodoPlusSourceLink defaults to heading "To-do"
  // when no fragment is present, per the user's v1.4.x R5
  // ask "don't use [[note#To-do]], just use [[note]]"). We
  // use `file.basename` (the `.md`-stripped name TFile
  // already gives us) rather than the `pathToWikiLink`
  // helper because `pathToWikiLink` itself wraps the result
  // in `[[ ]]` — wrapping it a second time here produced the
  // malformed `[[[[note]]]]` title.
  const wikilinkTitle = `[[${file.basename}]]`;
  // Forward to the view layer, which is responsible for
  // actually mutating the in-memory `DashboardData` and
  // writing the change back to disk. The `options.title`
  // shape is the single contract between renderer and view
  // for the new card's identity (see `RenderCallbacks.onCardAdd`).
  callbacks.onCardAdd(column.name, { title: wikilinkTitle });
}
