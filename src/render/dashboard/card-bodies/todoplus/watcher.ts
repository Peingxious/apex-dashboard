/**
 * src/render/dashboard/card-bodies/todoplus/watcher.ts
 *
 * Owns the lifecycle of the per-card TodoPlus watcher
 * (`MutationObserver` + `metadataCache.on("changed", …)`
 * subscription). Replaces the inline implementation that lived
 * at `renderer.ts:4593-4684` (the `ensureTodoPlusWatcher`
 * function), fixing LEAK-003 in the process.
 *
 * **LEAK-003 (fixed in Step 8.4)**: before this refactor, the
 * `todoPlusWatchers` Map was only cleaned up in two places:
 *
 *   1. When the same `card.id` re-installed the watcher
 *      (`existing.observer.disconnect(); todoPlusWatchers.delete`)
 *   2. When the `MutationObserver` body callback noticed the
 *      card left the DOM (the `teardown` closure)
 *
 *   Neither path runs when a card is permanently DELETED from
 *   the dashboard. The body-level observer fires (the card is
 *   gone from the DOM) — so case (2) should cover it. BUT, if
 *   the dashboard re-renders for any reason while the card is
 *   still in `this.data` (e.g. user toggles a filter, or a
 *   save-then-rerender cycle), the `cardEl` reference becomes
 *   stale and `teardown` is never invoked for the previous
 *   watcher. The orphan `MutationObserver` and the orphan
 *   `metadataCache` subscription then leak for the entire
 *   view lifetime.
 *
 * **Fix**: every watcher registration is also recorded on the
 * `globalDisposer` (via `addCustom`). On `disposeAllRenderers()`
 * (called from `view.ts:onClose`) we iterate the recorded
 * teardowns and call each one, so the worst case is bounded by
 * "1 view session" instead of "until the plugin reloads".
 *
 * **Behaviour preservation**: the watcher fires under the
 * exact same conditions as the pre-refactor code. The
 * `metadataCache.on("changed", …)` callback re-renders the
 * card body, and the `MutationObserver` on `document.body`
 * still tears down on `cardEl` removal. Only the bookkeeping
 * is centralised.
 */

import type { App, TFile } from "obsidian";
import type {
  DashboardCard,
  DashboardSettings,
  RenderCallbacks,
} from "../../../../types";
import { todoPlusWatchers } from "../../../state";
import { globalDisposer } from "../../../lifecycle";

export interface TodoPlusWatcherContext {
  /** Obsidian app instance. */
  app: App;
  /** The dashboard card owning the TodoPlus list. */
  card: DashboardCard;
  /** The `.dashboard-card` element wrapping the card; used as
   *  the `MutationObserver` liveness check. */
  cardEl: HTMLElement;
  /** The vault-relative path of the source note. */
  sourcePath: string;
  /** Render callbacks bag. */
  callbacks: RenderCallbacks;
  /** Optional dashboard settings (forwarded to the re-render). */
  settings?: DashboardSettings;
  /**
   * Re-render the card body. Invoked when the source note
   * changes. The watcher itself does not import
   * `renderTodoPlusBody` to avoid a cycle; the caller passes
   * the bound function. Signature mirrors the original
   * `renderTodoPlusBody(bodyRoot, card, callbacks, app,
   * settings, sourcePath)` call, with `bodyRoot` and
   * `card`/`callbacks`/`app`/`settings` already closed over.
   */
  renderBody: (sourcePath: string) => void | Promise<void>;
}

/**
 * Install (or no-op if a watcher for this `card.id` +
 * `sourcePath` already exists) the TodoPlus watcher. Idempotent
 * within a single view lifetime. Safe to call from
 * `renderTodoPlusBody` on every render — the early return on
 * line `if (existing && existing.sourcePath === sourcePath)
 * return;` short-circuits the redundant install.
 *
 * **Side effects**:
 *   - Registers the watcher in the central `todoPlusWatchers` Map
 *   - Subscribes to `app.metadataCache.on("changed", …)`
 *   - Subscribes to `new MutationObserver(() => …)` on
 *     `document.body`
 *   - Records the teardown closure on `globalDisposer` so it
 *     runs on `disposeAllRenderers()`
 */
export function installTodoPlusWatcher(ctx: TodoPlusWatcherContext): void {
  const { app, card, cardEl, sourcePath, renderBody } = ctx;

  // -----------------------------------------------------------------
  // Early-return: identical (cardId, sourcePath) already watched
  // -----------------------------------------------------------------
  const existing = todoPlusWatchers.get(card.id);
  if (existing && existing.sourcePath === sourcePath) return;

  // -----------------------------------------------------------------
  // Replace any pre-existing watcher for this cardId with a
  // different sourcePath (e.g. user changed the wikilink target)
  // -----------------------------------------------------------------
  if (existing) {
    app.metadataCache.offref(
      existing.ref as Parameters<typeof app.metadataCache.offref>[0],
    );
    existing.observer.disconnect();
    todoPlusWatchers.delete(card.id);
  }

  // -----------------------------------------------------------------
  // Source-note change handler. Re-renders the card body in
  // place; the header is a sibling in the parent container, so
  // we only need to clear the body root before re-dispatching.
  // -----------------------------------------------------------------
  const onChange = (file: TFile) => {
    if (file.path !== sourcePath) return;
    if (!document.body.contains(cardEl)) return;
    const bodyRoot = cardEl.querySelector(
      ".dashboard-card-body",
    ) as HTMLElement | null;
    if (bodyRoot) {
      bodyRoot.empty();
      void renderBody(sourcePath);
    }
  };
  const ref = app.metadataCache.on("changed", onChange);

  // -----------------------------------------------------------------
  // Teardown closure. Registered on `globalDisposer` so the
  // view-close path nukes any orphans the body-level observer
  // missed.
  // -----------------------------------------------------------------
  const teardown = () => {
    app.metadataCache.offref(ref);
    observer.disconnect();
    const current = todoPlusWatchers.get(card.id);
    if (current && current.ref === ref) {
      todoPlusWatchers.delete(card.id);
    }
  };
  globalDisposer.addCustom(`todoplus:${card.id}`, teardown);

  // -----------------------------------------------------------------
  // Body-level observer. Deliberately broad subscription
  // (childList + subtree) so any DOM mutation that detaches
  // the card triggers teardown. Obsidian can detach/reattach
  // the card at any time (tab switch, save, scroll).
  // -----------------------------------------------------------------
  const observer = new MutationObserver(() => {
    if (!document.body.contains(cardEl)) teardown();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  todoPlusWatchers.set(card.id, { sourcePath, ref, observer });
}
