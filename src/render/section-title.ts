/**
 * src/render/section-title.ts
 *
 * Column / section title rendering and the "is this column
 * protected from deletion?" predicate. Extracted from
 * `renderer.ts` in Step 8.5.
 *
 * **Why a separate file**: the two functions are tightly
 * coupled (the title render path calls into the inline
 * markdown renderer), they have no DOM-mutation side effects
 * beyond the title element, and they are consumed from
 * `renderSection` and the column-delete callback. Hoisting
 * them to their own module keeps `renderer.ts` focused on the
 * section/card dispatch and lets future per-column styling
 * land in one place.
 *
 * **Behaviour preservation**: the title render produces exactly
 * the same DOM as before — empty, then either a wikilink (via
 * `renderInlineMarkdown`) or plain text (via `setText`). The
 * protection predicate is a 3-clause check (idx 0, has `[[`,
 * has `#`) that is byte-for-byte identical to the pre-refactor
 * `isColumnProtected` at `renderer.ts:2515-2524`.
 */

import type { App } from "obsidian";
import type { DashboardData } from "../types";
import { renderInlineMarkdown } from "./wikilink-inline";

/**
 * Render a column title into `titleEl`. If the title contains
 * a `[[` opener, dispatch to `renderInlineMarkdown` so the
 * wikilink becomes a real Obsidian internal link with the
 * native Page Preview. Otherwise, fall back to `setText` for
 * the cheap path.
 */
export function renderColumnTitle(
  titleEl: HTMLElement,
  name: string,
  app: App,
  sourcePath?: string,
): void {
  titleEl.empty();
  const resolvedSource =
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "";
  if (name.includes("[[")) {
    renderInlineMarkdown(titleEl, name, app, resolvedSource);
  } else {
    titleEl.setText(name);
  }
}

/**
 * Check whether a column should be protected from deletion.
 * Three cases are protected:
 *
 *   1. The first column (idx 0) — the "main heading" of the
 *      dashboard, where the user typically pins their primary
 *      section.
 *   2. The column name contains a wikilink opener `[[` — the
 *      user explicitly linked something here and we should not
 *      silently drop the reference.
 *   3. The column name contains a `#` tag — same reasoning.
 *
 * Returns `false` if `data` is not provided (e.g. tests).
 */
export function isColumnProtected(
  columnName: string,
  data?: DashboardData,
): boolean {
  if (!data) return false;
  const idx = data.columns.findIndex((c) => c.name === columnName);
  // First column (main heading) is protected
  if (idx === 0) return true;
  // Columns with wiki-links [[...]] or tags # are protected
  if (columnName.includes("[[") || columnName.includes("#")) return true;
  return false;
}
