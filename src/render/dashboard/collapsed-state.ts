/**
 * src/render/dashboard/collapsed-state.ts
 *
 * Per-column "collapsed" persistence. The dashboard lets the
 * user collapse any column body by clicking its title bar; the
 * collapsed-state set is stored in `localStorage` (one key,
 * JSON-encoded `string[]`) so the choice survives reloads and
 * plugin reloads.
 *
 * **Why a dedicated module** (Step 8.8.0B.4.2, v1.5.0 refactor):
 * the previous version of this logic was at the top of
 * `renderer.ts` (lines 316-336) and used two private helpers
 * (`getCollapsedSections` + `saveCollapsedSections`) that were
 * only consumed by `renderSection` (also slated to move to
 * `render-section.ts` in 8.8.0B.4.3). Centralising the storage
 * key, the reader, and the writer in one place keeps the
 * `localStorage` schema and the try/catch in one place — any
 * future migration (e.g. moving the key to `plugin.loadData`)
 * only has to change this file.
 *
 * **Behaviour preservation**: the storage key string,
 * JSON-encoding format, and `try`/`catch` boundary are kept
 * byte-for-byte identical to the original. A read failure
 * (corrupted JSON, blocked storage) still returns an empty
 * `Set<string>`, exactly as it did before the refactor.
 */

/**
 * The single `localStorage` key under which the collapsed-set
 * is JSON-encoded. Exported so the dashboard "reset settings"
 * affordance can clear it without re-typing the string.
 */
export const COLLAPSED_KEY = "peingxious-dashboard-collapsed";

/**
 * Read the collapsed-set from `localStorage`. Returns an empty
 * set when the key is missing, when `JSON.parse` throws, or when
 * the stored value is not a JSON array of strings. The defensive
 * `try`/`catch` ensures the dashboard never fails to render just
 * because the storage layer is corrupted.
 */
export function getCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Persist the collapsed-set back to `localStorage`. The
 * `Set<string>` is spread into a `string[]` so the JSON shape
 * stays portable (any future cross-tab reader just needs to
 * `JSON.parse` the same way).
 */
export function saveCollapsedSections(collapsed: Set<string>): void {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
}
