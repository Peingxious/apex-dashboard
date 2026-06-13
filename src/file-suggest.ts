import { App, FuzzySuggestModal, TFile } from "obsidian";
import {
  WIKILINK_OPENERS,
  WIKILINK_CLOSERS,
  findWikilinkContext,
  applyWikilinkReplacement,
  type WikilinkContext,
} from "./wikilink-context";

// Track the currently-open dropdown across all attachFileSuggest
// instances. When the dashboard re-renders (e.g. after saving a task)
// the old input element is removed from the DOM, which means the old
// `attachFileSuggest` closure is orphaned and its `close()` is never
// called — leaving the dropdown floating in the body. The next
// `open()` sweeps that orphan away before creating a new one, so we
// never see two stacked dropdowns.
let activeDropdown: HTMLElement | null = null;

/**
 * Removes every `.dashboard-file-suggest` node from document.body and
 * clears `has-open-suggest` markers from any cards. Called:
 *   1) at the very start of open()
 *   2) before a dashboard re-render (via closeAllFileSuggests)
 *   3) when an input element is detected as detached from the DOM
 */
function sweepAllFileSuggestDropdowns(): void {
  try {
    document.querySelectorAll(".dashboard-file-suggest").forEach((el) => {
      try {
        (el as any).__cleanup?.();
        el.remove();
      } catch (_) {
        /* already detached — ok */
      }
    });
    document
      .querySelectorAll(".has-open-suggest")
      .forEach((el) => el.classList.remove("has-open-suggest"));
    activeDropdown = null;
  } catch (_) {
    /* DOM read failures are non-fatal — just continue */
  }
}

/**
 * Public hook for the dashboard renderer — closes all floating
 * file-suggest dropdowns before a re-render so stale nodes are not
 * left behind on document.body.
 */
export function closeAllFileSuggests(): void {
  sweepAllFileSuggestDropdowns();
}

// Re-export so existing consumers that imported these symbols from
// "./file-suggest" keep working without changes.
export {
  WIKILINK_OPENERS,
  WIKILINK_CLOSERS,
  findWikilinkContext,
  applyWikilinkReplacement,
};
export type { WikilinkContext };

export interface FileSuggestHandle {
  isActive(): boolean;
  close(): void;
  tryPickSelection(): boolean;
}

/**
 * Attach a file search suggest dropdown to an input element.
 * Shows a dropdown with vault files, positioned right below the input.
 *
 * @param onPick  Optional: called immediately when user picks a suggestion item.
 *                Receives the REPLACED input value (which includes any
 *                leading text the user typed before `[[`, plus the
 *                picked file's `[[basename]]` wikilink) and the TFile
 *                that was picked. The caller decides which one to use:
 *                task-add uses the replaced value (so the user's
 *                leading prefix ends up in the task title);
 *                project-doc-add uses the TFile's path to keep
 *                strict file-reference semantics.
 *                The caller is still responsible for clearing the
 *                input afterwards.
 */
export function attachFileSuggest(
  el: HTMLElement,
  app: App,
  onPick?: (value: string, file: TFile) => void,
): FileSuggestHandle {
  const input = el as HTMLInputElement | HTMLTextAreaElement;

  // Layer 1 — never attach twice to the same DOM element. Without
  // this, every dashboard re-render adds another listener on the same
  // input (when a card body is re-built with identical elements), and
  // each instance independently creates its own dropdown node on
  // document.body, producing the "two stacked dropdowns" bug.
  const alreadyAttached = (input as any).__fileSuggestAttached;
  if (alreadyAttached) {
    console.log(
      "[dbg-fs] skip double-attach on input.value=" +
        JSON.stringify(input.value),
    );
    return alreadyAttached;
  }

  console.log(
    "[dbg-fs] attachFileSuggest input.tag=" +
      input.tagName +
      " hasOnPick=" +
      (onPick ? "yes" : "no"),
  );
  let active = false;
  let dropdown: HTMLElement | null = null;
  let items: TFile[] = [];
  let selectedIndex = -1;
  let pickedIndex = -1;
  let lastQuery = "";

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

  const listFiles = () => {
    return app.vault
      .getFiles()
      .filter((f) => !f.path.startsWith("."))
      .filter((f) => VAULT_FILE_EXTS.has(f.extension));
  };

  const filterFiles = (q: string): TFile[] => {
    const query = q.toLowerCase().trim();
    // Empty query (user just typed `[[` and hasn't started searching
    // yet) — show the full list so the user can see what's available
    // and pick without further typing. Once they type any char we
    // narrow down to substring matches.
    const files = listFiles();
    if (!query) {
      return files.slice(0, 20);
    }
    const matched = files
      .filter(
        (f) =>
          f.path.toLowerCase().includes(query) ||
          f.basename.toLowerCase().includes(query),
      )
      .slice(0, 20);
    return matched;
  };

  const positionDropdown = () => {
    if (!dropdown) return;
    const rect = input.getBoundingClientRect();
    const viewportH = window.innerHeight;
    // Cap the dropdown's overall height at the available space below
    // the input (or 320px, whichever is smaller). We do NOT set a
    // min-height: when there's only 1-2 items, the dropdown should
    // shrink to fit those rows + 6px padding, not inflate to a fixed
    // 220-260px box that leaves a huge empty dark area under the last
    // row (this was the "2 dropdowns / fixed-height background" bug).
    const spaceBelow = Math.max(0, viewportH - rect.bottom - 8);
    const maxH = Math.min(320, Math.max(60, spaceBelow));
    // Stash the cap on the element so render() can also clamp the
    // inner scroll container to the same value when there are many
    // items and the dropdown needs to scroll.
    (dropdown as any).__maxH = maxH;
    // Apply ALL layout-affecting properties inline. Inline styles win
    // against any host-theme or .dashboard-* rule, which matters here
    // because we observed ancestor cards (backdrop-filter + overflow:hidden)
    // shrinking the dropdown to 32px.
    dropdown.style.position = "fixed";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.width = `${Math.max(rect.width, 280)}px`;
    // Height is content-driven, BUT we enforce a sensible floor
    // (≈ 2 rows + 6px padding) so the dropdown never collapses to a
    // useless ~32px strip when only 1 file matches. The previous
    // version's "0 min-height" was overcorrecting — single-match
    // results looked like a clipped chip. We still let the list
    // overflow-scroll when there are more items than `maxH` allows.
    const minH = Math.min(96, maxH);
    dropdown.style.maxHeight = `${maxH}px`;
    dropdown.style.minHeight = `${minH}px`;
    dropdown.style.height = "";
    dropdown.style.zIndex = "99999";
    dropdown.style.bottom = "auto";
    dropdown.style.transform = "none";
    dropdown.style.visibility = "visible";
    dropdown.style.display = "flex";
    dropdown.style.flexDirection = "column";
    dropdown.style.overflow = "hidden";
    dropdown.style.boxSizing = "border-box";
    dropdown.style.padding = "0";
    dropdown.style.margin = "0";
    dropdown.style.border = "1px solid rgba(255,255,255,0.1)";
    dropdown.style.borderRadius = "6px";
    dropdown.style.background = "#1f1f23";
    dropdown.style.color = "#e6e6e6";
    dropdown.style.fontSize = "14px";
    dropdown.style.lineHeight = "1.4";
  };

  const render = () => {
    if (!dropdown) return;
    dropdown.empty();
    const list = dropdown.createDiv({ cls: "suggestion-container" });
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "2px";
    list.style.padding = "6px";
    list.style.width = "100%";
    list.style.boxSizing = "border-box";
    list.style.minHeight = "0";
    // The list shrinks/grows to fit the actual item count, capped at
    // the same maxH we set on the dropdown in positionDropdown().
    // When there's only 1 item, the list is ~52px tall (item 40 + padding
    // 12), NOT a fixed 220px — the dropdown as a whole shrinks to
    // match, eliminating the "empty fixed-height background" the
    // user saw in the screenshot.
    list.style.maxHeight = `${(dropdown as any).__maxH ?? 320}px`;
    list.style.flex = "0 1 auto";
    list.style.overflowY = "auto";
    for (let i = 0; i < items.length; i++) {
      const f = items[i]!;
      const isSelected = i === selectedIndex;
      // Use a <div role="option"> instead of a <button> — buttons can be
      // styled down to a 12px line-height by aggressive host resets, and
      // that was the root cause of the "dropdown is only 32px tall" bug.
      const row = list.createDiv({
        cls: "suggestion-item" + (isSelected ? " is-selected" : ""),
        attr: { role: "option", tabindex: "-1" },
      });
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "10px 12px";
      row.style.height = "40px";
      row.style.minHeight = "40px";
      row.style.maxHeight = "40px";
      row.style.fontSize = "14px";
      row.style.lineHeight = "20px";
      // Selected row: a soft accent tint. We previously also drew an
      // inset 1px box-shadow as an "inner border" on top of the tint,
      // and the combination of background + inset border read as
      // TWO distinct panels inside a single row (this was the
      // "2 panels" rendering bug reported by users). Drop the inset
      // border entirely — the translucent tint alone is plenty to
      // mark the active row. Non-selected rows get no box-shadow at
      // all (a 1px transparent box-shadow is still a paint operation
      // and can produce a sub-pixel hairline on some themes, which
      // is also part of the "extra panel" look).
      row.style.background = isSelected ? "rgba(99, 102, 241, 0.22)" : "";
      row.style.boxShadow = "none";
      row.style.borderRadius = "4px";
      row.style.cursor = "pointer";
      row.style.boxSizing = "border-box";
      row.style.flex = "0 0 40px";
      row.style.transition = "background 0.1s ease, box-shadow 0.1s ease";
      const name = row.createDiv({
        cls: "suggestion-content",
        text: f.basename,
      });
      name.style.flex = "1";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      name.style.display = "block";
      name.style.fontSize = "14px";
      name.style.lineHeight = "20px";
      name.style.color = "inherit";
      name.setAttribute("title", f.path);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pick(f);
      });
    }
  };

  const open = () => {
    // Layer 2 — sweep every orphan dropdown + marker from the
    // body before we create a new one. This guarantees that no matter
    // how many attachFileSuggest closures exist, only one dropdown
    // node ever lives on document.body at a time.
    sweepAllFileSuggestDropdowns();

    if (active) return;
    active = true;

    dropdown = document.body.createDiv({ cls: "dashboard-file-suggest" });
    activeDropdown = dropdown;
    positionDropdown();

    // Mark every dashboard container in the ancestor chain so the CSS
    // can relax overflow:hidden and let the dropdown render outside the
    // card boundaries. The class is removed again in close().
    const ancestors: HTMLElement[] = [];
    let n: HTMLElement | null = input;
    while (n) {
      if (n.classList && n.classList.contains("dashboard-card")) {
        ancestors.push(n);
      }
      n = n.parentElement;
    }
    for (const a of ancestors) a.classList.add("has-open-suggest");
    (dropdown as any).__ancestors = ancestors;

    const onOutside = (ev: MouseEvent) => {
      if (!dropdown) return;
      if (dropdown.contains(ev.target as Node)) return;
      if (ev.target === input) return;
      close();
    };
    document.addEventListener("mousedown", onOutside);

    const onReposition = () => positionDropdown();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    (dropdown as any).__cleanup = () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  };

  const close = () => {
    if (!active) return;
    active = false;
    selectedIndex = -1;
    pickedIndex = -1;
    items = [];
    lastQuery = "";
    if (dropdown) {
      (dropdown as any).__cleanup?.();
      // Restore overflow:hidden on the cards we relaxed in open().
      const ancestors: HTMLElement[] = (dropdown as any).__ancestors ?? [];
      for (const a of ancestors) a.classList.remove("has-open-suggest");
      dropdown.remove();
      if (activeDropdown === dropdown) {
        activeDropdown = null;
      }
      dropdown = null;
    }
  };

  const update = () => {
    const value = input.value;
    const caret = (input as HTMLTextAreaElement).selectionStart ?? value.length;
    // #region debug-point update-entry
    console.log(
      "[dbg-fs] update caret=" + caret + " value=" + JSON.stringify(value),
    );
    // #endregion debug-point update-entry
    // The dropdown is now strictly a wikilink autocomplete: it only
    // opens while the caret sits inside an unclosed `[[…`. Normal
    // text input (e.g. typing "hello", or a task title) leaves the
    // dropdown closed. The user opts in to the dropdown by typing
    // the two opening brackets themselves — same UX as the Obsidian
    // editor.
    const ctx = findWikilinkContext(value, caret);
    if (!ctx) {
      // #region debug-point update-close
      console.log("[dbg-fs] update -> close (no ctx)");
      // #endregion debug-point update-close
      close();
      return;
    }
    const q = ctx.query;

    if (!active) open();
    if (!dropdown) return;
    positionDropdown();

    if (q === lastQuery) return;
    lastQuery = q;

    items = filterFiles(q);
    // No row is selected by default — the user must navigate with ↑/↓
    // to commit a pick. This keeps the dropdown a pure preview of matches
    // and matches the request: "if I didn't navigate, the typed text is
    // the user's intent".
    selectedIndex = -1;
    pickedIndex = -1;
    render();
    if (items.length === 0) {
      close();
    }
  };

  const insertIntoTextarea = (text: string) => {
    const ta = input as HTMLTextAreaElement;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const next = before + text + after;
    ta.value = next;
    const caret = start + text.length;
    ta.setSelectionRange(caret, caret);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };

  /**
   * Replace the active `[[…` (or `【【…`) fragment (from `ctx.start`
   * up to the caret, plus any `]]` / `】】` the user has already typed
   * past the caret) with `linkText`. Used when the user picks a file
   * from the dropdown: their typed `[[partial` becomes `[[path]]`.
   *
   * Leading text typed BEFORE the opener is ALWAYS preserved via
   * `value.slice(0, ctx.start)` inside `applyWikilinkReplacement` —
   * the user can type "review " before `[[` and that prefix is kept
   * verbatim, so the result is "review [[path]]", not just
   * "[[path]]" (this was the "don't replace my content"
   * requirement).
   */
  const replaceWikilinkFragment = (linkText: string): string | null => {
    const value = input.value;
    const caret = (input as HTMLTextAreaElement).selectionStart ?? value.length;
    const ctx = findWikilinkContext(value, caret);
    // #region debug-point rwf-entry
    console.log(
      "[dbg-fs] rwf entry caret=" +
        caret +
        " value=" +
        JSON.stringify(value) +
        " linkText=" +
        JSON.stringify(linkText) +
        " ctx=" +
        JSON.stringify(ctx),
    );
    // #endregion debug-point rwf-entry
    if (!ctx) return null;
    const { next, caret: newCaret } = applyWikilinkReplacement(
      value,
      caret,
      ctx,
      linkText,
    );
    if (input instanceof HTMLTextAreaElement) {
      input.value = next;
      input.setSelectionRange(newCaret, newCaret);
    } else {
      input.value = next;
    }
    // Dispatch AFTER the assignment so listeners (e.g. update()) see
    // the final value. We return the new string so the caller doesn't
    // have to re-read `input.value` after the synchronous handler
    // chain — that race was previously leaving the callback with the
    // pre-replacement value when the input event triggered further
    // mutations in other handlers.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // #region debug-point rwf-after-dispatch
    console.log(
      "[dbg-fs] rwf after-dispatch next=" +
        JSON.stringify(next) +
        " input.value=" +
        JSON.stringify(input.value),
    );
    // #endregion debug-point rwf-after-dispatch
    return next;
  };

  const pick = (file: TFile) => {
    const basename = file.basename;
    // #region debug-point pick-entry
    console.log(
      "[dbg-fs] pick entry basename=" +
        JSON.stringify(basename) +
        " preInputValue=" +
        JSON.stringify(input.value),
    );
    // #endregion debug-point pick-entry
    // The user was typing a wikilink fragment when they picked; the
    // fragment gets replaced with a complete `[[basename]]` link
    // (basename-only form matches what the dashboard stores
    // everywhere else). The leading text typed BEFORE the `[[` is
    // preserved verbatim (see applyWikilinkReplacement).
    // We use the value returned by replaceWikilinkFragment directly
    // rather than re-reading input.value, because the dispatched
    // `input` event runs synchronous listeners (update(), etc.) that
    // can mutate the field. We pass both the REPLACED input value AND
    // the TFile to the `onPick` callback so each consumer can choose:
    //   - task-add consumers use `value` so the leading text + the
    //     wikilink end up in the task title (the user typed "review "
    //     then picked a file → task is "review [[note]]", not just
    //     "[[note]]" — the "don't replace my content" requirement)
    //   - project-doc consumers use `file.path` to keep the strict
    //     file-reference semantics
    const replaced = replaceWikilinkFragment(`[[${basename}]]`);
    // #region debug-point pick-after-rwf
    console.log(
      "[dbg-fs] pick after-rwf replaced=" +
        JSON.stringify(replaced) +
        " input.value=" +
        JSON.stringify(input.value),
    );
    // #endregion debug-point pick-after-rwf
    if (onPick) {
      // #region debug-point pick-onpick-arg
      console.log(
        "[dbg-fs] pick -> onPick arg=" +
          JSON.stringify(replaced ?? input.value) +
          " file.path=" +
          JSON.stringify(file.path),
      );
      // #endregion debug-point pick-onpick-arg
      onPick(replaced ?? input.value, file);
    }
    close();
  };

  const moveSelection = (delta: number) => {
    if (!active) return;
    if (items.length === 0) return;
    const next = Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
    if (next === selectedIndex) return;
    selectedIndex = next;
    // The user has now explicitly navigated to this row, so it becomes
    // the "picked" candidate that Enter will commit.
    pickedIndex = next;
    render();
    if (dropdown) {
      const selected = dropdown.querySelector(
        ".suggestion-item.is-selected",
      ) as HTMLElement | null;
      selected?.scrollIntoView({ block: "nearest" });
    }
  };

  const tryPickSelection = () => {
    if (!active) return false;
    // Only commit if the user has explicitly arrow-navigated since the
    // last query change. Otherwise the typed text is the user's intent.
    if (pickedIndex < 0 || pickedIndex >= items.length) return false;
    const f = items[pickedIndex]!;
    pick(f);
    return true;
  };

  input.addEventListener("input", () => update());
  input.addEventListener("focus", () => update());
  input.addEventListener("blur", () => {
    setTimeout(() => close(), 150);
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      if (!active) update();
      if (!active) return;
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      if (!active) update();
      if (!active) return;
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Escape") {
      if (!active) return;
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      if (tryPickSelection()) {
        e.preventDefault();
      }
    }
  });

  // If the dashboard re-renders while the dropdown is open, the
  // input element is removed from the DOM — but this
  // attachFileSuggest closure is still alive and never calls
  // close() on its own. A MutationObserver on the input's parent
  // detects removal and tears down the dropdown before the next
  // render cycle creates a competing instance (the "two stacked
  // dropdowns" bug).
  let domObserver: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined") {
    const checkDetached = () => {
      if (!document.body.contains(input)) {
        close();
        domObserver?.disconnect();
        domObserver = null;
      }
    };
    domObserver = new MutationObserver(checkDetached);
    // Observe the nearest persistent ancestor — the input itself
    // may swap parents during re-renders, so walk up to the card
    // root or the top dashboard container.
    let obsTarget: Node = input.parentElement ?? document.body;
    let hops = 0;
    while (
      obsTarget &&
      !(
        obsTarget instanceof HTMLElement &&
        obsTarget.classList.contains("dashboard-card")
      ) &&
      hops < 10
    ) {
      obsTarget = obsTarget.parentElement ?? document.body;
      hops++;
    }
    try {
      domObserver.observe(obsTarget, { childList: true, subtree: true });
    } catch (_) {
      // Fallback: observe document.body less precisely, but still
      // try to detect when the input goes away.
      try {
        domObserver.observe(document.body, { childList: true, subtree: true });
      } catch (_) {
        // Browser doesn't support MutationObserver properly — skip.
        domObserver = null;
      }
    }
  }

  // Tag this input so future callers can see it is already wired up
  // (Layer 1 guard above). This prevents the same input from growing
  // multiple independent listeners and dropdown nodes on re-render.
  const handle: FileSuggestHandle = {
    isActive: () => active,
    close,
    tryPickSelection,
  };
  (input as any).__fileSuggestAttached = handle;

  return handle;
}

/**
 * A file picker modal (centered dialog) for selecting files to add to Project cards.
 * Shows "文件" header, search input, file list, and cancel button.
 */
export class FilePickerModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile) => void;

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder(t("filePicker.search"));
  }

  onOpen(): void {
    super.onOpen();
    const { contentEl } = this;
    contentEl.addClass("dashboard-file-picker");
    // Override title
    const titleEl = this.containerEl.querySelector(
      ".modal-title",
    ) as HTMLElement;
    if (titleEl) titleEl.setText(t("filePicker.title"));
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(item: TFile): string {
    return item.basename;
  }

  onChooseItem(item: TFile): void {
    this.onSelect(item);
  }
}

function t(key: string): string {
  // Simple i18n fallback for file picker strings
  const map: Record<string, string> = {
    "filePicker.title": "文件",
    "filePicker.search": "搜索...",
  };
  return map[key] ?? key;
}
