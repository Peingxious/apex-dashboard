/**
 * src/render/bullet-utils.ts
 *
 * Shared text helpers for checklist / bullet manipulation. Used by
 * the in-place editor of both task cards (in `card-bodies/todo.ts`)
 * and memo cards (in `card-bodies/memo.ts`): both card types round
 * trip a `- ` / `> - ` bullet marker on every line whenever the
 * user enters or leaves the textarea, so the underlying markdown
 * stays parseable as a checklist by Obsidian.
 *
 * **Why a shared module** (Step 8.8.0B.4.1, v1.5.0 refactor):
 * the helpers were originally in `renderer.ts` (lines 1483-1504)
 * and were needed by both the task body (extracted to `todo.ts` in
 * 8.6) and the memo body (extracted to `memo.ts` in 8.6). The
 * cleanest home is a tiny dedicated module that both card-body
 * modules import — neither body owns the bullet concept.
 *
 * The functions are pure, side-effect-free, and synchronous; they
 * are safe to call from any render path.
 */

/**
 * Strip a leading bullet marker from every line in `text`.
 * Used when leaving the in-place editor (textarea → view) so the
 * display layer no longer carries the `- ` that was there only
 * to make Obsidian treat each line as a checklist item. Also
 * unwraps the `> ` quote prefix so a quoted line reads
 * `> <content>` instead of `> - <content>`.
 *
 * Inverse of {@link addBulletPrefix}. Round-trips a paragraph
 * whose every line is either plain or quoted. The behaviour
 * mirrors the Obsidian API for the Legacy Editor checkbox
 * (every list line *must* start with `- ` to be checkable).
 */
export function stripBulletPrefix(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("- ")) return line.slice(2);
      if (line.startsWith("> - ")) return "> " + line.slice(4);
      return line;
    })
    .join("\n");
}

/**
 * Re-add a leading bullet marker (`- `) to every non-empty line
 * in `text`. Used when entering the in-place editor (view →
 * textarea) so the underlying markdown can be parsed back as a
 * checklist. Quoted lines (`> …`) get a `> - ` prefix so the
 * bullet stays on the right side of the quote marker.
 *
 * Inverse of {@link stripBulletPrefix}.
 */
export function addBulletPrefix(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith("> ")) return "> - " + line.slice(2);
      return "- " + line;
    })
    .join("\n");
}
