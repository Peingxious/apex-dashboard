/**
 * src/render/dashboard/card-bodies/todoplus/io.ts
 *
 * Write-path for the TodoPlus card body. Every function in this
 * file is a `vault.process` round-trip that mutates a single
 * line (or, in `ensureTodoPlusHeading`'s case, appends a brand
 * new heading block) inside the source note. The TodoPlus card
 * body never holds an in-memory copy of the checklist — every
 * toggle / add / edit / delete goes through one of these
 * helpers, and the metadataCache `changed` event scheduled by
 * `refresh.ts` re-renders the card.
 *
 * **Why this is its own module**: the write path is the only
 * place where we touch `vault.process`, and the line-replace
 * regexes are subtle (especially the `✅ YYYY-MM-DD` suffix
 * used by `setTodoPlusItemChecked`). Keeping them in one file
 * makes it easy to spot a regression during code review.
 *
 * **Behaviour preservation**: every function body is a
 * byte-for-byte copy of the pre-refactor implementation in
 * `renderer.ts:5059-5330`. Only the module location changed;
 * no logic was rewritten.
 */
import { Notice, type App, type TFile } from "obsidian";
import { t } from "../../../../i18n";
import { scanMarkdownHeadings } from "./parse";
import type { TodoPlusChecklistItem } from "./types";

/**
 * Toggles a single TodoPlus checklist line in the source file
 * by rewriting only the `- [ ]` / `- [x]` portion of that
 * line. We use `vault.process` so Obsidian owns the file
 * modification event (metadataCache refresh, file watchers,
 * etc.).
 */
export async function setTodoPlusItemChecked(
  app: App,
  file: TFile,
  item: TodoPlusChecklistItem,
  checked: boolean,
): Promise<void> {
  await app.vault.process(file, (content) => {
    const formatLocalDate = (d: Date): string => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const before = content.slice(0, item.lineStart);
    const line = content.slice(item.lineStart, item.lineEnd);
    const after = content.slice(item.lineEnd);
    let replaced = line.replace(
      /^(\s*-\s+\[)( |x|X)(\]\s+.*)$/,
      (_full, head: string, _box: string, tail: string) =>
        `${head}${checked ? "x" : " "}${tail}`,
    );
    const trimmed = replaced.trimEnd();
    const doneWithDateRe = /\s+✅\s+\d{4}-\d{2}-\d{2}\s*$/;
    const doneBareRe = /\s+✅\s*$/;
    if (checked) {
      if (!doneWithDateRe.test(trimmed)) {
        const base = trimmed.replace(doneBareRe, "");
        replaced = `${base} ✅ ${formatLocalDate(new Date())}`;
      } else {
        replaced = trimmed;
      }
    } else {
      replaced = trimmed.replace(doneWithDateRe, "").replace(doneBareRe, "");
    }
    return before + replaced + after;
  });
}

/**
 * Appends a new unchecked `- [ ] text` line to the
 * `## <heading>` block in `file`. Insertion point is the
 * **end of the heading slice** (right before the next
 * same-or-higher-level heading, or EOF if there isn't one).
 * The trailing newline of the previous content is preserved
 * so we never collapse two paragraphs into one.
 *
 * If the heading doesn't exist yet we append a fresh
 * `## <heading>` block at the end of the file (so the user
 * can start adding tasks immediately — matches the behaviour
 * of the add-card flow).
 */
export async function addTodoPlusItem(
  app: App,
  file: TFile,
  heading: string,
  text: string,
): Promise<void> {
  const safeText = text.replace(/\r?\n/g, " ").trim();
  await app.vault.process(file, (content) => {
    const lines = content.split("\n");
    // Locate the heading line (exact text match, level-2 by
    // convention).
    const headingIdx = lines.findIndex(
      (l) => /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim() === heading,
    );
    if (headingIdx < 0) {
      // Heading missing — append a fresh block.
      const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      return `${content}${prefix}\n## ${heading}\n- [ ] ${safeText}\n`;
    }
    // Find the end of the heading slice: the next heading at
    // level <= 2 (we only auto-create level-2 headings, but be
    // safe and match the same slice rule the read path uses).
    const headingLevel = lines[headingIdx]!.match(/^#+/)?.[0].length ?? 2;
    let endIdx = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const m = lines[i]!.match(/^(#+)\s/);
      if (m && m[1]!.length <= headingLevel) {
        endIdx = i;
        break;
      }
    }
    // Trim any blank lines at the tail of the slice so the new
    // item lands RIGHT AFTER the last non-blank line (a
    // previous task). Without this, every add reintroduces a
    // blank line between the last task and the new one — the
    // list visibly "drifts" apart over time and the file grows
    // with empty lines in the middle. We preserve the original
    // tail structure when there is no following heading
    // (`endIdx === lines.length`): if the file ended with a
    // blank line we still trim it so the EOF shape is tight,
    // matching the v1.4.4 ask "remove the newlines in the
    // middle".
    while (endIdx > headingIdx + 1 && lines[endIdx - 1]!.trim() === "") {
      endIdx--;
    }
    // Insert a new unchecked item right before the end of the
    // slice. The `lines` array was built by splitting on `\n`,
    // so a single `splice + join` round-trip preserves the
    // original line endings byte-for-byte.
    const newLines = [...lines];
    newLines.splice(endIdx, 0, `- [ ] ${safeText}`);
    return newLines.join("\n");
  });
}

/**
 * Deletes a single TodoPlus checklist line from the source
 * file. We slice from the start of the line up to and
 * including the trailing newline (so we never leave a stray
 * empty line behind). If the line happens to be the last line
 * in the file and has no trailing newline, we drop the line
 * content only.
 */
export async function removeTodoPlusItem(
  app: App,
  file: TFile,
  item: TodoPlusChecklistItem,
): Promise<void> {
  await app.vault.process(file, (content) => {
    const before = content.slice(0, item.lineStart);
    const after = content.slice(item.lineEnd);
    // The character right after `item.lineEnd` should be a
    // newline (that's where the line ended). Drop it too so
    // we don't leave a blank line behind. If there is no
    // trailing newline (last line in the file without `\n`),
    // don't add one.
    if (after.startsWith("\n")) {
      return before + after.slice(1);
    }
    return before + after;
  });
}

/**
 * Rewrites the **text portion** of a TodoPlus checklist line,
 * preserving the `- [ ]` / `- [x]` marker, the leading
 * whitespace, and the trailing newline. We never touch the
 * checkbox state from this path — use
 * `setTodoPlusItemChecked` for that.
 */
export async function editTodoPlusItem(
  app: App,
  file: TFile,
  item: TodoPlusChecklistItem,
  newText: string,
): Promise<void> {
  const safeText = newText.replace(/\r?\n/g, " ").trim();
  await app.vault.process(file, (content) => {
    const before = content.slice(0, item.lineStart);
    const line = content.slice(item.lineStart, item.lineEnd);
    const after = content.slice(item.lineEnd);
    const replaced = line.replace(/^(\s*-\s+\[[ x]\])\s+.*$/, `$1 ${safeText}`);
    return before + replaced + after;
  });
}

/**
 * Ensures that `file` contains a level-2 heading with the
 * given `heading` text (default `"To-do"`). If the heading is
 * missing, appends a fresh `## ${heading}` block to the end
 * of the file via `app.vault.process` (which gives Obsidian a
 * single undo entry). The append uses a single newline
 * separator with all trailing whitespace stripped, so the
 * new heading sits on its own line with no blank line between
 * the previous body and the heading (the v1.4.4 "remove the
 * newlines in the middle" ask).
 *
 * Idempotent: safe to call multiple times. Returns `true` if
 * the heading is now present in the file (either was already
 * there or was just appended). Returns `false` if
 * `vault.process` threw and the heading is still missing — a
 * `renderer.todoPlusWriteError` Notice is shown in that case.
 *
 * Shared entry point used by `addTodoPlusCardFromNote`,
 * `promptTodoPlusSourceLink`, and the view layer's embedded /
 * non-embedded todoplus add flows. Re-exported by
 * `./modals.ts` so the existing
 * `src/render/dashboard/card-bodies/todoplus/modals.ts` shim
 * keeps working without an import-path churn across the
 * codebase.
 *
 * v1.4.x R5 — fix: read the file's CURRENT content from disk
 * (via cachedRead, which Obsidian keeps fresh) and scan for
 * the heading ourselves, instead of trusting
 * `app.metadataCache.getFileCache(file).headings`.
 *
 * Why: the previous implementation could return early
 * (`exists = true`) on a stale cache entry, leaving the
 * source file untouched even when the user had manually
 * deleted `## To-do` since the last metadata re-index. The
 * card would then be created with a `[[note#To-do]]` title
 * pointing at a heading the file no longer has, and
 * `resolveTodoPlusSlice` would fall through to the
 * lazy-auto-create path. That path is also a
 * `ensureTodoPlusHeading` call, so the same stale-cache bug
 * re-fired on the very first render — the user saw a
 * permanently "preparing" placeholder and no on-disk change.
 *
 * `vault.cachedRead` reads through Obsidian's in-memory file
 * cache, so it is cheap and reflects the latest in-process
 * state (including any `vault.process` writes we just did).
 */
export async function ensureTodoPlusHeading(
  app: App,
  file: TFile,
  heading: string = "To-do",
): Promise<boolean> {
  let content: string;
  try {
    content = await app.vault.cachedRead(file);
  } catch (e) {
    new Notice(
      t("renderer.todoPlusWriteError", { message: (e as Error).message }),
    );
    return false;
  }
  const headings = scanMarkdownHeadings(content);
  const exists = headings.some(
    (h) => h.level === 2 && h.heading === heading,
  );
  if (exists) return true;
  try {
    await app.vault.process(file, (current) => {
      // Strip any trailing newlines from the existing content
      // and re-add a single separator so the heading sits on
      // its own line with no extra blank line in the middle.
      const trimmed = current.replace(/\n+$/, "");
      return `${trimmed}\n## ${heading}\n`;
    });
  } catch (e) {
    new Notice(
      t("renderer.todoPlusWriteError", { message: (e as Error).message }),
    );
    return false;
  }
  return true;
}
