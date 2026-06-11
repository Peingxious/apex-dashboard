import { App, FuzzySuggestModal, TFile } from "obsidian";

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
 *                If provided, the picked value is NOT written into input —
 *                the caller handles the action (e.g. adding a note).
 *                If omitted, behaviour falls back to filling input (legacy).
 */
export function attachFileSuggest(
  el: HTMLElement,
  app: App,
  onPick?: (value: string) => void,
): FileSuggestHandle {
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  let active = false;
  let dropdown: HTMLElement | null = null;
  let items: TFile[] = [];
  let selectedIndex = -1;
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
    if (!query) return [];

    const files = listFiles();
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
    // Compute how much vertical room is left below the input. Clamp to a
    // generous minimum so we always have at least 220px of dropdown even
    // when the input sits at the very bottom of the viewport.
    const spaceBelow = Math.max(0, viewportH - rect.bottom - 8);
    const height = Math.min(260, Math.max(220, spaceBelow));
    // Apply ALL layout-affecting properties inline. Inline styles win
    // against any host-theme or .dashboard-* rule, which matters here
    // because we observed ancestor cards (backdrop-filter + overflow:hidden)
    // shrinking the dropdown to 32px.
    dropdown.style.position = "fixed";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.width = `${Math.max(rect.width, 280)}px`;
    dropdown.style.height = `${height}px`;
    dropdown.style.maxHeight = `${height}px`;
    dropdown.style.minHeight = `${height}px`;
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
    list.style.flex = "1 1 auto";
    list.style.overflowY = "auto";
    for (let i = 0; i < items.length; i++) {
      const f = items[i]!;
      // Use a <div role="option"> instead of a <button> — buttons can be
      // styled down to a 12px line-height by aggressive host resets, and
      // that was the root cause of the "dropdown is only 32px tall" bug.
      const row = list.createDiv({
        cls: "suggestion-item" + (i === selectedIndex ? " is-selected" : ""),
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
      row.style.color = "#e6e6e6";
      row.style.background = "transparent";
      row.style.borderRadius = "4px";
      row.style.cursor = "pointer";
      row.style.boxSizing = "border-box";
      row.style.flex = "0 0 40px";
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
    if (active) return;
    active = true;
    dropdown = document.body.createDiv({ cls: "dashboard-file-suggest" });
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
    items = [];
    lastQuery = "";
    if (dropdown) {
      (dropdown as any).__cleanup?.();
      // Restore overflow:hidden on the cards we relaxed in open().
      const ancestors: HTMLElement[] = (dropdown as any).__ancestors ?? [];
      for (const a of ancestors) a.classList.remove("has-open-suggest");
      dropdown.remove();
      dropdown = null;
    }
  };

  const update = () => {
    const q = input.value;
    if (!q.trim()) {
      close();
      return;
    }

    if (!active) open();
    if (!dropdown) return;
    positionDropdown();

    if (q === lastQuery) return;
    lastQuery = q;

    items = filterFiles(q);
    selectedIndex = items.length > 0 ? 0 : -1;
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

  const pick = (file: TFile) => {
    const path = file.path;
    if (onPick) {
      onPick(path);
      close();
      return;
    }

    const linkText = `[[${path}]]`;
    if (input instanceof HTMLTextAreaElement) {
      insertIntoTextarea(linkText);
    } else {
      input.value = linkText;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    close();
  };

  const moveSelection = (delta: number) => {
    if (!active) return;
    if (items.length === 0) return;
    const next = Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
    if (next === selectedIndex) return;
    selectedIndex = next;
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
    if (selectedIndex < 0 || selectedIndex >= items.length) return false;
    const f = items[selectedIndex]!;
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

  return {
    isActive: () => active,
    close,
    tryPickSelection,
  };
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
