/**
 * src/render/wikilink-inline.ts
 *
 * Inline markdown renderer used by the dashboard for all
 * user-facing strings (column titles, memo bodies, task
 * descriptions, project item labels, ...). Extracted from
 * `renderer.ts` in Step 8.5.
 *
 * **Why a separate file**: this module owns a self-contained
 * mini-language — wikilinks (ASCII + full-width), external
 * markdown links, bold/italic/code/highlight/strikethrough —
 * that nothing else in `renderer.ts` cares about. Moving it
 * lets the rest of the file focus on layout, and it gives the
 * inline parser one place to evolve (e.g. add new token types
 * or a syntax tree).
 *
 * **Behaviour preservation**:
 *   - The single regex `INLINE_TOKEN_PATTERN` is identical
 *     to the pre-refactor version, including the priority
 *     ordering (`**` before `*` so bold wins over italic).
 *   - The `renderWikilink` resolution algorithm — alias,
 *     `#fragment` / `^block-ref`, basename disambiguation via
 *     `getSearchableFiles` — is preserved verbatim.
 *   - The native Page Preview bridge (Ctrl/Cmd-hover →
 *     `hover-link` workspace event) is preserved.
 *
 * **PERF-001 fix**: the per-link `setTimeout` handle for the
 * Ctrl-hover preview delay is now registered against
 * `globalDisposer`. Pre-refactor, the handle was a module-level
 * `let hoverTimer` that was never cleared on view close. If
 * the user opened a popup and then closed the view in the 200 ms
 * window, the timer would fire after teardown. With the
 * disposer, view-close calls `clearTimeout` for any pending
 * hover-preview timer.
 */

import { App, Menu, Notice } from "obsidian";
import { t } from "../i18n";
import { getSearchableFiles } from "./search";
import { globalDisposer } from "./lifecycle";

/**
 * Single-pass tokenizer for inline markdown. Captures the
 * supported patterns in priority order; everything else is
 * emitted as a text node.
 *
 * Supported patterns (in this order):
 *   [[wikilink]] / [[link|alias]] / [[link#fragment]]  -> renderWikilink
 *   【【...】】                                         -> renderWikilink (CJK full-width)
 *   [text](url)                                        -> renderExternalLink
 *   **bold**                                           -> <strong class="dashboard-inline-bold">
 *   *italic* / _italic_                                -> <em class="dashboard-inline-italic">
 *   `code`                                             -> <code class="dashboard-inline-code">
 *   ==highlight==                                      -> <mark class="dashboard-inline-highlight">
 *   ~~strikethrough~~                                  -> <del class="dashboard-inline-strike">
 *
 * Order matters: `**` (bold) must come before `*` (italic) so
 * the engine doesn't greedily eat one `*` of a bold marker as
 * an italic.
 */
const INLINE_TOKEN_PATTERN =
  /(\[\[[^\]]+\]\]|【【[^】]+】】|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|==[^=\n]+==|~~[^~\n]+~~)/g;

/** Delay between Ctrl/Cmd hover and the "hover-link" event. */
const HOVER_DELAY_MS = 200;

/**
 * Tokenize `text` and append the result to `container`. Each
 * match is dispatched to `renderInlineToken`. The regex is
 * stateful (`g` flag) so `lastIndex` is reset on entry as a
 * defensive measure in case the module is hot-reloaded.
 */
export function renderInlineMarkdown(
  container: HTMLElement,
  text: string,
  app: App,
  sourcePath?: string,
): void {
  if (!text) return;

  // Reset the lastIndex on the shared pattern in case anything
  // else ever reuses it; defensively keeps state from leaking
  // across calls.
  INLINE_TOKEN_PATTERN.lastIndex = 0;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      const before = text.slice(cursor, match.index);
      if (before) {
        container.appendChild(document.createTextNode(before));
      }
    }
    const token = match[0];
    if (token) {
      renderInlineToken(container, token, app, sourcePath);
    }
    cursor = INLINE_TOKEN_PATTERN.lastIndex;
  }
  if (cursor < text.length) {
    const remaining = text.slice(cursor);
    if (remaining) {
      container.appendChild(document.createTextNode(remaining));
    }
  }
}

/**
 * Append a single inline-markdown token to `container`. The
 * regex already guarantees a recognised prefix/suffix shape; we
 * dispatch on the prefix here.
 */
function renderInlineToken(
  container: HTMLElement,
  token: string,
  app: App,
  sourcePath?: string,
): void {
  // Wikilink: [[...]]  (alias / #fragment handled inside renderWikilink)
  if (token.startsWith("[[") && token.endsWith("]]") && token.length >= 5) {
    const inner = token.slice(2, -2);
    renderWikilink(container, inner, app, sourcePath);
    return;
  }

  // Full-width wikilink: 【【...】】 (common in Chinese input)
  if (token.startsWith("【【") && token.endsWith("】】") && token.length >= 5) {
    const inner = token.slice(2, -2);
    renderWikilink(container, inner, app, sourcePath);
    return;
  }

  // External markdown link: [text](url)
  if (token.startsWith("[") && token.endsWith(")")) {
    const extMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (extMatch) {
      renderExternalLink(container, extMatch[1]!, extMatch[2]!);
      return;
    }
  }

  // Bold: **text**  (length >= 5 means at least 1 char between the **)
  if (token.startsWith("**") && token.endsWith("**") && token.length >= 5) {
    const el = container.createEl("strong", { cls: "dashboard-inline-bold" });
    // Recurse so nested inline markdown (e.g. **bold [[link]]**) renders.
    renderInlineMarkdown(el, token.slice(2, -2), app, sourcePath);
    return;
  }

  // Italic: *text*  or  _text_  (length >= 3)
  if (
    token.length >= 3 &&
    ((token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_")))
  ) {
    const el = container.createEl("em", { cls: "dashboard-inline-italic" });
    renderInlineMarkdown(el, token.slice(1, -1), app, sourcePath);
    return;
  }

  // Inline code: `text`  (length >= 3, content is literal)
  if (token.startsWith("`") && token.endsWith("`") && token.length >= 3) {
    const el = container.createEl("code", { cls: "dashboard-inline-code" });
    el.textContent = token.slice(1, -1);
    return;
  }

  // Highlight: ==text==  (length >= 5)
  if (token.startsWith("==") && token.endsWith("==") && token.length >= 5) {
    const el = container.createEl("mark", {
      cls: "dashboard-inline-highlight",
    });
    renderInlineMarkdown(el, token.slice(2, -2), app, sourcePath);
    return;
  }

  // Strikethrough: ~~text~~  (length >= 5)
  if (token.startsWith("~~") && token.endsWith("~~") && token.length >= 5) {
    const el = container.createEl("del", { cls: "dashboard-inline-strike" });
    renderInlineMarkdown(el, token.slice(2, -2), app, sourcePath);
    return;
  }

  // Anything that matched the regex but didn't fit a known shape
  // (shouldn't happen in practice) — fall back to literal text.
  container.appendChild(document.createTextNode(token));
}

/**
 * Simple split-and-dispatch renderer used for the legacy
 * `renderTextWithLinks` callers (drag labels, etc.). Only
 * recognises wikilinks and external links — no bold/italic/etc.
 */
export function renderTextWithLinks(
  container: HTMLElement,
  text: string,
  app: App,
): void {
  const parts = text.split(/(\[\[[^\]]+?\]\]|\[[^\]]+\]\([^)]+\))/g);
  for (const part of parts) {
    const wikiMatch = part.match(/^\[\[([^\]]+)\]\]$/);
    if (wikiMatch) {
      renderWikilink(container, wikiMatch[1]!, app);
      continue;
    }
    const extMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (extMatch) {
      renderExternalLink(container, extMatch[1]!, extMatch[2]!);
      continue;
    }
    if (part) {
      container.appendChild(document.createTextNode(part));
    }
  }
}

/**
 * Append a single wikilink element to `container`. Resolves
 * the alias / fragment / block-ref syntax, disambiguates
 * duplicate basenames using the vault file index, and wires
 * up click, native-context-menu, and Ctrl/Cmd-hover-preview
 * bridges.
 */
export function renderWikilink(
  container: HTMLElement,
  content: string,
  app: App,
  sourcePath?: string,
): void {
  let alias: string | undefined;
  let linkPart = content;

  const pipeIdx = content.indexOf("|");
  if (pipeIdx !== -1) {
    alias = content.slice(pipeIdx + 1);
    linkPart = content.slice(0, pipeIdx);
  }

  let path = linkPart;
  let fragment: string | undefined;
  let fragmentSep: "#" | "^" | undefined;

  // Support both # heading anchors and ^ block references
  const hashIdx = linkPart.indexOf("#");
  const caretIdx = linkPart.indexOf("^");
  let sepIdx = -1;
  if (hashIdx !== -1 && caretIdx !== -1) {
    sepIdx = Math.min(hashIdx, caretIdx);
  } else if (hashIdx !== -1) {
    sepIdx = hashIdx;
  } else if (caretIdx !== -1) {
    sepIdx = caretIdx;
  }

  if (sepIdx !== -1) {
    path = linkPart.slice(0, sepIdx);
    fragment = linkPart.slice(sepIdx + 1);
    fragmentSep = linkPart[sepIdx] as "#" | "^";
  }

  const noteName = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  let displayName: string;
  if (alias) {
    displayName = alias;
  } else if (fragment) {
    displayName = `${noteName} > ${fragment}`;
  } else {
    // Show short name; if duplicate basenames exist, show parent folder
    const basename = noteName;
    try {
      const allFiles = getSearchableFiles(app);
      const sameNameFiles = allFiles.filter((mf) => mf.basename === basename);
      if (sameNameFiles.length > 1) {
        // Show parent folder to disambiguate
        const parts = path.split("/");
        if (parts.length >= 2) {
          displayName = `${parts[parts.length - 2]}/${noteName}`;
        } else {
          displayName = noteName;
        }
      } else {
        displayName = noteName;
      }
    } catch (err) {
      displayName = noteName;
    }
  }

  const fullLink =
    fragment && fragmentSep ? `${path}${fragmentSep}${fragment}` : path;

  const link = container.createEl("a", {
    cls: "dashboard-wikilink internal-link",
    text: displayName,
    attr: {
      "data-href": fullLink,
      href: fullLink,
      "data-link-icon": "",
      "data-link-icon-after": "",
      "data-link-text": "",
    },
  });

  const linkText = fullLink;

  // v1.4.x R5 — use the explicit sourcePath passed from the view
  // layer (which is the dashboard's host file) for link
  // resolution, click/open, right-click menu, and hover preview.
  // `getActiveFile()` is the legacy behavior.
  const resolvedSourceForHelpers =
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "";

  link.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Use native Obsidian link resolution for proper fragment/heading navigation
    app.workspace.openLinkText(linkText, resolvedSourceForHelpers, false, {
      active: true,
    });
  });

  try {
    const linkPath = fragment ? path : linkText;
    const file = app.metadataCache.getFirstLinkpathDest(
      linkPath,
      resolvedSourceForHelpers,
    );
    if (file) {
      link.setAttribute("data-link-path", file.path);
      link.style.setProperty("--data-link-path", file.path);
    }
  } catch {}

  // Native right-click context menu. The dashboard renders
  // wikilinks as custom DOM, not via the markdown post-processor,
  // so Obsidian's global "show on internal-link" hook never sees
  // them. We re-create the *file* context menu by hand — the one
  // the user gets when right-clicking a note in the File Explorer
  // (Open in new tab / pane / window, Rename, Move to, Star,
  // Delete, Reveal in OS, etc.).
  //
  // The trick: resolve the wikilink text to a real TFile, then
  // fire the "file-menu" workspace event. Obsidian core + every
  // community plugin (Page Preview, Recent Files, Excalidraw,
  // ...) listens for that event and contributes its entries, so
  // we get the exact same menu as a real file-explorer right-click
  // — without us having to add a single item by hand.
  link.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // fragment-only links (e.g. current-note headings) and
    // unresolved wikilinks have no backing file — fall back to
    // Obsidian's own link-menu (with our built-in defaults below)
    // for those, so the user still gets a useful menu.
    const linkPath = fragment ? path : linkText;
    const file = app.metadataCache.getFirstLinkpathDest(
      linkPath,
      resolvedSourceForHelpers,
    );
    if (file) {
      const menu = new Menu();
      app.workspace.trigger("file-menu", menu, file, resolvedSourceForHelpers);
      menu.showAtMouseEvent(e);
      return;
    }

    // Fallback for unresolved links: built-in "Open" actions.
    const fallback = new Menu();
    fallback.addItem((item) =>
      item
        .setTitle(t("renderer.openLink") || "Open link")
        .setIcon("file-text")
        .onClick(() => {
          void app.workspace.openLinkText(
            linkText,
            resolvedSourceForHelpers,
            false,
          );
        }),
    );
    fallback.addItem((item) =>
      item
        .setTitle(t("renderer.openLinkNewTab") || "Open link in new pane")
        .setIcon("external-link")
        .onClick(() => {
          void app.workspace.openLinkText(
            linkText,
            resolvedSourceForHelpers,
            false,
            {
              newLeaf: true,
            } as Parameters<typeof app.workspace.openLinkText>[3],
          );
        }),
    );
    fallback.addSeparator();
    fallback.addItem((item) =>
      item
        .setTitle(t("renderer.copyLink") || "Copy link")
        .setIcon("copy")
        .onClick(() => {
          const linkMd = alias ? `[[${linkPart}|${alias}]]` : `[[${linkText}]]`;
          void navigator.clipboard.writeText(linkMd);
          new Notice(t("renderer.linkCopied") || "Link copied");
        }),
    );
    fallback.showAtMouseEvent(e);
  });

  // Native Obsidian Page Preview.
  //
  // The dashboard's wikilinks are custom DOM (not
  // markdown-rendered), so the markdown post-processor never sees
  // them and Obsidian's built-in Page Preview never activates.
  // We bridge that gap by dispatching the same "hover-link"
  // workspace event the editor's post-processor fires — Page
  // Preview then takes over and shows the exact same popover it
  // shows in the editor, honouring the user's "hover" vs
  // "Ctrl/Cmd + hover" setting and the "Reader mode" / "Default
  // editor" setting.
  //
  // The event signature is a *single object* with the following
  // keys:
  //   event        — the originating mouseover MouseEvent
  //   source       — string identifying the caller; Page Preview
  //                  accepts "preview" to mean "renderer wants
  //                  the native popover"
  //   hoverParent  — { hoverPopover: null } scaffold that Page
  //                  Preview populates with the live HoverPopover
  //                  instance once the popover is built
  //   targetEl     — the link DOM element being hovered
  //   linktext     — the wikilink target text
  //   sourcePath   — the file the wikilink is being resolved from
  //
  // PERF-001 fix: the `setTimeout` handle is registered against
  // `globalDisposer` so view-close can clear any pending preview
  // timer. Pre-refactor, the handle was a module-level `let`
  // that survived view close.
  let hoverTimer: number | null = null;
  const clearHoverTimer = (): void => {
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };

  link.addEventListener("mouseover", (event) => {
    if (hoverTimer !== null) return;
    if (!link.isConnected) return;
    // Hold Ctrl/Cmd to preview — the rest of the time the event
    // is intentionally ignored to avoid spinning up the markdown
    // renderer (and the live popover) on every mouse pass, which
    // is expensive on large libraries.
    const mouseEvent = event as MouseEvent;
    if (!mouseEvent.ctrlKey && !mouseEvent.metaKey) return;
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null;
      if (!link.isConnected) return;
      // Resolve the source path so Page Preview can find the
      // link in the vault. Falls back to the currently active
      // file (typically the dashboard file when the dashboard
      // view is focused, or the host markdown when embedded) so
      // the preview works the same as in the editor.
      const resolvedSource =
        sourcePath ?? app.workspace.getActiveFile()?.path ?? "";
      (
        app.workspace as unknown as {
          trigger: (type: string, payload: unknown) => void;
        }
      ).trigger("hover-link", {
        event: mouseEvent,
        source: "preview",
        hoverParent: { hoverPopover: null },
        targetEl: link,
        linktext: linkText,
        sourcePath: resolvedSource,
      });
    }, HOVER_DELAY_MS);
    // Register the handle so a view-close during the 200 ms
    // window can cancel it. PERF-001.
    globalDisposer.addTimeout(hoverTimer, `wikilink-hover:${linkText}`);
  });
  link.addEventListener("mouseout", clearHoverTimer);
  link.addEventListener("keydown", clearHoverTimer);
}

/**
 * Append a single external-link span. Click opens the URL in a
 * new browser tab via `window.open(url, "_blank")`.
 */
export function renderExternalLink(
  container: HTMLElement,
  text: string,
  url: string,
): void {
  const link = container.createSpan({
    cls: "dashboard-external-link",
    text: text,
  });
  link.addEventListener("click", (e) => {
    e.stopPropagation();
    window.open(url, "_blank");
  });
}
