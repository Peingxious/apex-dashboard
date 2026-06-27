/**
 * src/render/dom-helpers.ts
 *
 * Tiny DOM / style helpers used by the render layer. Kept
 * dependency-light (only `obsidian` types) so any new sub-file
 * can import without dragging in chart.js / the rest of the
 * render graph.
 *
 * Hoisted from `renderer.ts` in Step 8.1 to:
 *  - give the new layout a discoverable home for small utilities
 *  - keep `renderer.ts` focused on rendering logic
 *  - enable unit tests in `tests/dom-helpers.test.mjs` (future)
 */

import { SELECTORS } from "./constants";

/**
 * Read a CSS custom property declared on the dashboard root.
 * Returns an empty string if the root is not in the DOM yet
 * (caller is responsible for falling back to its own default).
 *
 * Migration note: the body is byte-identical to the original
 * `getCSSVar` at `renderer.ts:80-85` (pre-refactor). The only
 * change is the use of the hoisted `SELECTORS.dashboardRoot`
 * constant so the magic string lives in one place.
 */
export function getCSSVar(name: string): string {
  const el = document.querySelector(SELECTORS.dashboardRoot);
  if (!el) return "";
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * Remove every child node from `el`. Thin wrapper around the
 * Obsidian API `el.empty()` to keep call sites short. Exists
 * for symmetry with `getCSSVar` and to give render sub-files
 * a single import line for common DOM operations.
 */
export function emptyChildren(el: HTMLElement): void {
  el.empty();
}
