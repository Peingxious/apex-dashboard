/**
 * src/render/dashboard/card-bodies/todoplus/parse.ts
 *
 * Pure-string parsers for the TodoPlus card body. None of the
 * functions in this file touch the filesystem or Obsidian's
 * metadata cache — they all operate on the inputs they're
 * given, which makes them trivially unit-testable and keeps the
 * side-effecting code (in `io.ts` / `slice.ts`) small.
 *
 * Exports:
 *   - `parseTodoPlusSourceLink`  — split a wikilink-ish string
 *     into `{ path, heading }`
 *   - `getTodoPlusSourceLinkFromTitle` — canonical reader for
 *     the card's `title` field
 *   - `parseTodoPlusChecklist` — extract the `- [ ]` /
 *     `- [x]` items inside a heading slice
 *   - `scanMarkdownHeadings` — flat list of ATX heading
 *     positions, used by `slice.ts` and `io.ts`
 *
 * **Behaviour preservation**: the function bodies are byte-for-byte
 * copies of the pre-refactor implementations in `renderer.ts`
 * (lines 4970-5013 and 5015-5058). Only the module location
 * changed; no logic was rewritten.
 */
import type { DashboardCard } from "../../../../types";
import type { TodoPlusChecklistItem } from "./types";

/**
 * Splits `card.sourceLink` into `{path, heading}`. Accepts:
 *
 *   - `dash002#To-do`           → `{ path: "dash002", heading: "To-do" }`
 *   - `[[dash002#To-do]]`       → same
 *   - `[[dash002#To-do|alias]]` → same
 *   - `dash002`                 → `{ path: "dash002", heading: "To-do" }` (default heading)
 *
 * Returns `null` if the input is empty.
 *
 * NOTE: there is no per-card `sourceLink` field anymore — the
 * source link lives in the card's `title` (a wikilink). Callers
 * pass `card.title` (or any source string) directly.
 */
export function parseTodoPlusSourceLink(
  raw: string,
): { path: string; heading: string } | null {
  const text = raw.trim();
  if (!text) return null;
  // Strip `[[ ]]` wrapper.
  const inner = text.replace(/^\[\[/, "").replace(/]]$/, "").trim();
  // Strip `|alias` tail.
  const pipeIdx = inner.indexOf("|");
  const linkPart = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
  // Split on first `#`.
  const hashIdx = linkPart.indexOf("#");
  if (hashIdx < 0) {
    return { path: linkPart.trim(), heading: "To-do" };
  }
  const path = linkPart.slice(0, hashIdx).trim();
  const heading = linkPart.slice(hashIdx + 1).trim();
  if (!path || !heading) return null;
  return { path, heading };
}

/**
 * Reads the source link out of a TodoPlus card's `title`. The
 * title is expected to be a wikilink of the form
 * `[[note#heading]]` (the only on-disk representation). Returns
 * the canonical `"note#heading"` string (no `[[ ]]` wrapper, no
 * `|alias` tail), or `""` when the title is empty / not a
 * usable wikilink. This is the single source-of-truth reader:
 * there is no per-card `sourceLink` field on the
 * `DashboardCard` type anymore.
 */
export function getTodoPlusSourceLinkFromTitle(card: DashboardCard): string {
  const title = (card.title ?? "").trim();
  if (!title) return "";
  const parsed = parseTodoPlusSourceLink(title);
  if (!parsed) return "";
  return `${parsed.path}#${parsed.heading}`;
}

/**
 * Parses the checklist inside a heading slice. Each item
 * carries absolute offsets into the source file so we can write
 * back to the exact line later (we never recompute offsets
 * against the full string, which avoids drift if the slice gets
 * trimmed or the file is large).
 */
export function parseTodoPlusChecklist(
  slice: string,
  baseOffset: number,
): TodoPlusChecklistItem[] {
  const items: TodoPlusChecklistItem[] = [];
  const lineOffsets: number[] = [];
  // Build a `lineStart` index for the slice (offsets relative
  // to the slice, not the full file).
  let cursor = 0;
  for (const part of slice.split("\n")) {
    lineOffsets.push(cursor);
    cursor += part.length + 1; // +1 for the \n
  }
  for (let i = 0; i < lineOffsets.length; i++) {
    const relStart = lineOffsets[i];
    const lineEndRel = relStart + slice.slice(relStart).indexOf("\n");
    const line = slice.slice(
      relStart,
      lineEndRel < relStart ? slice.length : lineEndRel,
    );
    // Match `- [ ] text` or `- [x] text` (case-insensitive on
    // x). We deliberately do not allow other bullet styles
    // (`*`, `+`, numbered lists) — TodoPlus mirrors a markdown
    // task list and we don't want to silently misinterpret
    // other bullets.
    const m = line.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const text = m[2].trim();
    items.push({
      lineStart: baseOffset + relStart,
      lineEnd: baseOffset + (lineEndRel < relStart ? slice.length : lineEndRel),
      checked,
      text,
    });
  }
  return items;
}

/**
 * Scan a markdown string for ATX headings (`#`–`######`).
 *
 * Mirrors Obsidian's metadataCache heading semantics closely
 * enough for our use: we only need to know "is there a
 * `## <name>` block?", and we want a result that **does not
 * depend on the metadata cache being up to date** (see
 * `ensureTodoPlusHeading` for the rationale).
 *
 * The output is a flat list of `{ level, heading, offset }` in
 * source order — `offset` is the character offset of the start
 * of the heading line in `content`, which callers can use to
 * compute slice ranges. The `level` / `heading` fields match
 * the shape of `metadataCache.getFileCache(file).headings` for
 * drop-in use.
 */
export function scanMarkdownHeadings(
  content: string,
): Array<{ level: number; heading: string; offset: number }> {
  const out: Array<{ level: number; heading: string; offset: number }> = [];
  // ATX heading: 1–6 `#`, followed by whitespace, then the
  // heading text up to end-of-line. Tabs/spaces around the
  // heading text are trimmed. Setext headings (`===` / `---`
  // underlines) are intentionally NOT supported here —
  // Obsidian does index them, but they are vanishingly rare in
  // the TodoPlus use-case (the user added the card by typing
  // `# To-do`-style in the picker) and adding the parser would
  // only widen the surface for false positives. The
  // `## To-do` we auto-append is ATX-form, so the round-trip
  // stays consistent.
  const re = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const level = m[1].length;
    const heading = m[2].trim();
    if (!heading) continue;
    out.push({ level, heading, offset: m.index });
  }
  return out;
}
