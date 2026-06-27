/**
 * src/render/dashboard/card-bodies/todoplus/slice.ts
 *
 * Read-path for the TodoPlus card body. `resolveTodoPlusSlice`
 * is the single entry point that turns a card's wikilink title
 * into a `{file, heading, start, end, items}` struct that
 * `renderTodoPlusBody` and the per-item helpers can consume.
 *
 * `waitForFileCache` is a small Obsidian-specific helper that
 * bridges the gap between "the user just opened Obsidian" and
 * "the metadata cache has indexed the file" — it's only used
 * for the belt-and-braces fallback inside
 * `resolveTodoPlusSlice`. Exposed so the test suite (if added
 * later) can stub it.
 *
 * **Behaviour preservation**: the function bodies are
 * byte-for-byte copies of the pre-refactor implementations in
 * `renderer.ts:4800-4896`. Only the module location changed;
 * no logic was rewritten.
 */
import { TFile, type App, type CachedMetadata } from "obsidian";
import {
  parseTodoPlusSourceLink,
  parseTodoPlusChecklist,
  scanMarkdownHeadings,
} from "./parse";
import type { TodoPlusSlice } from "./types";

/**
 * Parses `card.sourceLink` and returns the matching checklist
 * slice (file + heading + parsed items). Returns `null` when
 * the file or heading can't be resolved, or when the source
 * link is malformed.
 *
 * Note: this is an **async** function because
 * `getFirstLinkpathDest` can resolve links that haven't been
 * seen yet, but for files that have been observed we read the
 * cache synchronously. The `metadataCache.on("resolve")` event
 * isn't necessary here — we just call into Obsidian and let it
 * return what it has.
 */
export async function resolveTodoPlusSlice(
  app: App,
  sourceLink: string,
): Promise<TodoPlusSlice | null> {
  // Source link can be `dash002#To-do`, `[[dash002#To-do]]`,
  // or `[[dash002#To-do|alias]]`. Normalize to a
  // `{path, heading}` pair.
  const parsed = parseTodoPlusSourceLink(sourceLink);
  if (!parsed) return Promise.resolve(null);

  // Resolve the path with `getFirstLinkpathDest` (Obsidian's
  // standard link resolver, which handles aliases, basenames,
  // etc.).
  const dest = app.metadataCache.getFirstLinkpathDest(parsed.path, "");
  if (!(dest instanceof TFile)) return Promise.resolve(null);

  // Read the file content directly and scan headings ourselves
  // — do NOT rely solely on metadataCache, because right after
  // `ensureTodoPlusHeading` appends `## To-do` via
  // `vault.process`, the metadata cache may not have
  // re-indexed yet. Scanning the content we just read gives us
  // an authoritative answer.
  const content = await app.vault.cachedRead(dest);
  const headingPositions = scanMarkdownHeadings(content);

  const target = headingPositions.find(
    (h) => h.level === 2 && h.heading === parsed.heading,
  );
  if (!target) return Promise.resolve(null);

  const start = target.offset;
  const endCandidates = headingPositions
    .filter(
      (h) => h.offset > start && h.level <= 2 && h.heading !== parsed.heading,
    )
    .map((h) => h.offset)
    .filter((off) => off > start);
  const end =
    endCandidates.length > 0 ? Math.min(...endCandidates) : content.length;

  // Parse `- [ ]` / `- [x]` items inside the slice.
  const sliceContent = content.slice(start, end);
  const items = parseTodoPlusChecklist(sliceContent, start);

  return Promise.resolve({
    file: dest,
    heading: parsed.heading,
    start,
    end,
    items,
  });
}

/**
 * Waits for `app.metadataCache.getFileCache(file)` to return a
 * populated cache (with `headings` parsed). On a fresh
 * Obsidian startup the cache can be empty / partial for files
 * the user hasn't opened yet, so this returns the cache once
 * the next `metadataCache.on("changed")` event for that file
 * fires — or after a 2.5s timeout, whichever comes first. If
 * the cache is already populated, returns synchronously.
 */
export function waitForFileCache(
  app: App,
  file: TFile,
  timeoutMs: number = 2500,
): Promise<CachedMetadata | null> {
  const initial = app.metadataCache.getFileCache(file);
  if (initial && initial.headings) {
    return Promise.resolve(initial);
  }
  return new Promise<CachedMetadata | null>((resolve) => {
    let ref: any = null;
    const cleanup = () => {
      if (ref) {
        app.metadataCache.offref(ref);
        ref = null;
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(app.metadataCache.getFileCache(file));
    }, timeoutMs);
    ref = app.metadataCache.on("changed", (f) => {
      if (f === file) {
        clearTimeout(timer);
        cleanup();
        resolve(app.metadataCache.getFileCache(file));
      }
    });
  });
}
