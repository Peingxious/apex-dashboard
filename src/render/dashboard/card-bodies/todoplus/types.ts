/**
 * src/render/dashboard/card-bodies/todoplus/types.ts
 *
 * Shared types for the TodoPlus card body. The two interfaces
 * below used to live as anonymous inline types inside
 * `renderer.ts` (see pre-refactor `renderer.ts:4421-4440`) and
 * were never exported. The result was a tsc error cluster on
 * every function signature that referenced `TodoPlusSlice` /
 * `TodoPlusChecklistItem`. Centralising them here gives us
 *
 *   - One source of truth for the on-disk shape of a TodoPlus
 *     checklist line and the slice that contains it
 *   - Reusable types for the `parse.ts` / `slice.ts` / `io.ts`
 *     / `render-body.ts` / `render-item.ts` sub-modules without
 *     having to dance around the `any` fallback
 *   - A documented contract (this file) for any future caller
 *     that wants to mirror a checklist into the dashboard
 *
 * **Behaviour preservation**: the field shapes are byte-for-byte
 * identical to the pre-refactor inline types. The `lineStart` /
 * `lineEnd` / `checked` / `text` quartet matches the
 * `parseTodoPlusChecklist` output, and the `file` / `heading` /
 * `start` / `end` / `items` quintuple matches
 * `resolveTodoPlusSlice`'s return value. No field was added,
 * renamed, or repurposed.
 */
import type { TFile } from "obsidian";

/**
 * One `- [ ]` / `- [x]` line in the source note. Offsets are
 * absolute byte positions in the source file, so callers can
 * write back to the exact same line via `vault.process` without
 * re-scanning.
 */
export interface TodoPlusChecklistItem {
  /** Absolute byte offset of the start of this line in the
   *  source note (0-based, inclusive). */
  lineStart: number;
  /** Absolute byte offset of the end of this line in the
   *  source note (exclusive; excludes the trailing newline). */
  lineEnd: number;
  /** Whether the markdown checkbox is filled (`true` = done). */
  checked: boolean;
  /** Checkbox label text, with leading list-marker / indent
   *  stripped. */
  text: string;
}

/**
 * The slice of the source note that contains a TodoPlus
 * checklist. Returned by `resolveTodoPlusSlice` and threaded
 * through `renderTodoPlusBody` / `renderTodoPlusItem` so the
 * per-item helpers don't need to re-parse the file on every
 * action.
 */
export interface TodoPlusSlice {
  /** The resolved `TFile` of the source note. */
  file: TFile;
  /** The `## <heading>` text the checklist lives under. */
  heading: string;
  /** Byte range (inclusive `start`, exclusive `end`) of the
   *  heading slice in the cached file content. */
  start: number;
  end: number;
  /** Parsed checklist items inside the slice, in source order. */
  items: TodoPlusChecklistItem[];
}
