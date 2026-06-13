/**
 * Pure (no Obsidian dependency) wikilink context detection and
 * replacement helpers, used by `src/file-suggest.ts` to drive the
 * "only open dropdown after `[[` (or `【【`)" behaviour and the
 * fragment replacement on pick.
 *
 * Kept in its own file so the unit test under `tests/` can import
 * it directly without dragging in the Obsidian module shim.
 */

export const WIKILINK_OPENERS = ["[[", "【【"] as const;
export const WIKILINK_CLOSERS = ["]]", "】】"] as const;
export type WikilinkOpener = (typeof WIKILINK_OPENERS)[number];
export type WikilinkCloser = (typeof WIKILINK_CLOSERS)[number];

export interface WikilinkContext {
  /** Index of the opening bracket pair in the full value. */
  start: number;
  /** Text between the opener and the caret (the live query). */
  query: string;
  /** The exact opener the user typed (preserved on pick). */
  open: WikilinkOpener;
  /** The matching closer to use on pick (same family as `open`). */
  close: WikilinkCloser;
}

/**
 * Find the wikilink context at the current caret position. Returns
 * `null` when the caret is NOT inside an unclosed `[[…` (or
 * `【【…`) — i.e. plain text input, or the user has already typed
 * past the closing brackets.
 *
 * Supported bracket styles:
 *   - `[[ … ]]`  (ASCII — Obsidian default)
 *   - `【【 … 】】`  (full-width — common in Chinese input)
 */
export function findWikilinkContext(
  value: string,
  caret: number,
): WikilinkContext | null {
  const before = value.slice(0, caret);
  // Find the LATEST opener before the caret, picking whichever of
  // ASCII and full-width sits closer to the caret so that
  // `[[a]] [[b` resolves to the second link, not the first.
  let openIdx = -1;
  let openStr: WikilinkOpener = "[[";
  const asciiIdx = before.lastIndexOf("[[");
  const fwIdx = before.lastIndexOf("【【");
  if (asciiIdx === -1 && fwIdx === -1) return null;
  if (asciiIdx > fwIdx) {
    openIdx = asciiIdx;
    openStr = "[[";
  } else {
    openIdx = fwIdx;
    openStr = "【【";
  }

  // If the opener is immediately preceded by another opener
  // char, the preceding char is stray (e.g. `[[[abc` — the
  // first `[` is stray and the SECOND `[[` is the real opener).
  // We walk back to the PREVIOUS opener pair, but ONLY if one
  // exists; otherwise the current opener is the real one and we
  // leave it alone. This matches the user typing three `[`s in a
  // row and then text: the dropdown should drive the second `[[`.
  if (openIdx > 0) {
    const prev = value[openIdx - 1];
    if (openStr === "[[" && prev === "[") {
      const beforeOpen = before.slice(0, openIdx);
      const altIdx = beforeOpen.lastIndexOf("[[");
      if (altIdx !== -1) openIdx = altIdx;
    } else if (openStr === "【【" && prev === "【") {
      const beforeOpen = before.slice(0, openIdx);
      const altIdx = beforeOpen.lastIndexOf("【【");
      if (altIdx !== -1) openIdx = altIdx;
    }
  }

  // If a closing pair (any style) sits between this opener and the
  // caret, the user has already closed the link — no dropdown
  // context. We check both styles so the user can mix them
  // (e.g. type `【【abc]]`); whichever closer comes first wins.
  const closeStr: WikilinkCloser = openStr === "[[" ? "]]" : "】】";
  const searchFrom = openIdx + 2;
  const closeAscii = before.indexOf("]]", searchFrom);
  const closeFw = before.indexOf("】】", searchFrom);
  let closeHit = -1;
  if (closeAscii !== -1 && closeFw !== -1) {
    closeHit = Math.min(closeAscii, closeFw);
  } else if (closeAscii !== -1) {
    closeHit = closeAscii;
  } else if (closeFw !== -1) {
    closeHit = closeFw;
  }
  if (closeHit !== -1 && closeHit + 2 <= caret) return null;

  const query = before.slice(openIdx + 2, caret);
  // A newline inside a wikilink is not legal — treat as no
  // context so the dropdown stays closed across line breaks.
  if (query.includes("\n")) return null;
  return { start: openIdx, query, open: openStr, close: closeStr };
}

/**
 * Replace the active `[[…` (or `【【…`) fragment in `value` (from
 * `ctx.start` up to the caret, plus any `]]` / `】】` the user has
 * already typed past the caret) with `linkText`. Returns the new
 * value and caret position. Pure function so it can be unit
 * tested without a DOM.
 *
 * Leading text typed BEFORE the opener is preserved verbatim via
 * `value.slice(0, ctx.start)` — typing "review " then `[[` and
 * picking yields "review [[path]]", never just "[[path]]".
 */
export function applyWikilinkReplacement(
  value: string,
  caret: number,
  ctx: WikilinkContext,
  linkText: string,
): { next: string; caret: number } {
  const after = value.slice(caret);
  let dropClose = 0;
  if (after.startsWith(ctx.close)) dropClose = ctx.close.length;
  else if (after.startsWith(ctx.open === "[[" ? "】】" : "]]")) dropClose = 2;
  const before = value.slice(0, ctx.start);
  const afterCaret = value.slice(caret + dropClose);
  const next = before + linkText + afterCaret;
  const newCaret = before.length + linkText.length;
  return { next, caret: newCaret };
}
