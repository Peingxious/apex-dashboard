/**
 * src/render/search.ts
 *
 * Vault file enumeration used by the DocSearchModal (Ctrl+P-style
 * command palette inside the dashboard). Extracted from
 * `renderer.ts` in Step 8.5.
 *
 * **Why a separate file**: the only consumer is
 * `DocSearchModal`/`quick-actions.ts`, and the previous
 * `getSearchableFiles` lived in `renderer.ts` purely because
 * `renderer.ts` was the only file that already imported `App`.
 * Splitting keeps `renderer.ts` from accumulating utility
 * helpers that have nothing to do with rendering.
 *
 * **Behaviour preservation**: the returned `TFile[]` is filtered
 * by the same predicate as the pre-refactor implementation
 * (skips dotfiles, restricts to the curated extension set).
 * `DocSearchModal` is the sole caller; it iterates the array and
 * does not mutate it, so changing the implementation to a
 * generator or a streaming source in the future would not break
 * compatibility.
 */

import type { App } from "obsidian";

/**
 * File extensions surfaced by the dashboard command palette. The
 * pre-refactor `VAULT_FILE_EXTS` set lived at `renderer.ts:130-148`
 * and is reproduced verbatim here to keep the search results
 * identical.
 */
const VAULT_FILE_EXTS = new Set([
  "md",
  "pdf",
  "canvas",
  "base",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "mp3",
  "mp4",
  "m4a",
  "m4b",
  "mov",
  "mkv",
  "avi",
]);

/**
 * Return every vault file that should appear in the dashboard
 * command palette. Two filters are applied:
 *
 *   1. The path must not start with `.` (skips dotfolders like
 *      `.trash`, `.obsidian`).
 *   2. The extension must be in `VAULT_FILE_EXTS`. This is
 *      narrower than Obsidian's own file search — we hide
 *      `.json`, `.excalidraw`, etc. that have no useful preview.
 *
 * The returned array is a fresh `Array<TFile>`; callers may
 * sort or filter it without mutating shared state.
 */
export function getSearchableFiles(app: App) {
  return app.vault
    .getFiles()
    .filter((f) => !f.path.startsWith(".") && VAULT_FILE_EXTS.has(f.extension));
}
