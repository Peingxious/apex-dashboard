/**
 * src/render/dashboard/card-bodies/todoplus/refresh.ts
 *
 * Thin shim that delegates to `installTodoPlusWatcher`
 * (in `./watcher.ts`) for the metadataCache `changed`
 * subscription and the body-level `MutationObserver`. The
 * watcher module owns the lifecycle bookkeeping; the only
 * thing this file passes in is the `renderBody` callback (a
 * closure over `renderTodoPlusBody`).
 *
 * **Behaviour preservation**: the function body is a
 * byte-for-byte copy of the post-Step-8.4 implementation in
 * `renderer.ts:4897-4934`. Only the module location changed;
 * no logic was rewritten.
 */
import type { App } from "obsidian";
import type {
  DashboardCard,
  DashboardSettings,
  RenderCallbacks,
} from "../../../../types";
import { installTodoPlusWatcher } from "./watcher";
import { renderTodoPlusBody } from "./render-body";

/**
 * Schedules a reactive refresh for a TodoPlus card. Whenever
 * the source file's metadataCache `changed` event fires (the
 * user added/removed/checked/unchecked tasks in `dash002`),
 * we wipe the card's body and re-render it. The listener is
 * automatically torn down when the card leaves the DOM, so we
 * don't leak observers on long-lived sessions.
 *
 * **Step 8.4**: thin shim that delegates to
 * `installTodoPlusWatcher` in `./watcher.ts`. The watcher
 * module owns the `metadataCache.on("changed", …)`
 * subscription and the `MutationObserver`; the only thing we
 * still pass in is the `renderBody` callback (a closure over
 * `renderTodoPlusBody`).
 */
export function scheduleTodoPlusRefresh(
  app: App,
  listEl: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  settings?: DashboardSettings,
): void {
  const cardEl = listEl.closest(".dashboard-card") as HTMLElement | null;
  if (!cardEl) return;
  const sourcePath = listEl.dataset.todoplusFile;
  if (!sourcePath) return;

  installTodoPlusWatcher({
    app,
    card,
    cardEl,
    sourcePath,
    callbacks,
    settings,
    renderBody: (sp) =>
      renderTodoPlusBody(cardEl, card, callbacks, app, settings, sp),
  });
}
