import { Notice, TFile } from "obsidian";
import type { App } from "obsidian";
import type DashboardPlugin from "../main";

type PickerDeps = {
  app: App;
  plugin: DashboardPlugin;
  anchorEl: HTMLElement;
  rootEl: HTMLElement;
  embeddedNotePath: string | null;
  cleanupFns: Array<() => void>;
  embedNoteDashboard: (notePath: string) => Promise<void>;
  t: (key: string, vars?: Record<string, string>) => string;
};

export async function showColumnFilePicker({
  app,
  plugin,
  anchorEl,
  rootEl,
  embeddedNotePath,
  cleanupFns,
  embedNoteDashboard,
  t,
}: PickerDeps): Promise<void> {
  const mdFiles = app.vault.getMarkdownFiles();
  const columnFiles: TFile[] = [];
  const excluded = (plugin.settings.excludedNotePaths ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const f of mdFiles) {
    const lower = f.path.toLowerCase();
    if (
      excluded.some(
        (x) => lower === x || lower === `${x}.md` || lower.endsWith(`/${x}.md`),
      )
    )
      continue;
    try {
      const content = await app.vault.read(f);
      if (content.trimStart().startsWith("---")) {
        const endIdx = content.indexOf("---", 3);
        if (endIdx !== -1) {
          const yaml = content.slice(3, endIdx);
          if (
            (yaml.includes("columns:") || yaml.includes("column:")) &&
            !yaml.includes("peingxious-dashboard-template")
          ) {
            columnFiles.push(f);
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  if (columnFiles.length === 0) {
    new Notice(t("noteDash.noDashboardFiles"));
    return;
  }

  const existing = rootEl.querySelector(".dashboard-nav-dropdown");
  if (existing) existing.remove();

  const dropdown = anchorEl.createDiv({ cls: "dashboard-nav-dropdown" });
  dropdown.style.position = "";
  dropdown.style.top = "";
  dropdown.style.right = "";
  const list = dropdown.createDiv({ cls: "dashboard-nav-dropdown-list" });

  const searchRow = list.createDiv({ cls: "dropdown-search-row" });
  const searchInput = searchRow.createEl("input", {
    cls: "dropdown-search-input",
    type: "text",
    placeholder: t("noteDash.searchPlaceholder"),
  });

  const titleEl = list.createEl("div", {
    cls: "dropdown-title",
    text: t("noteDash.selectDash") + ` (${columnFiles.length})`,
  });

  const allItems: { el: HTMLElement; file: TFile }[] = [];

  for (const f of columnFiles) {
    const item = list.createEl("button", {
      cls: "dashboard-nav-dropdown-item",
      text: f.basename,
      attr: { title: f.path },
    });

    if (f.path === embeddedNotePath) {
      item.addClass("dashboard-nav-dropdown-item--open");
    }

    allItems.push({ el: item, file: f });

    item.addEventListener("click", async () => {
      dropdown.remove();
      await embedNoteDashboard(f.path);
    });
  }

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase().trim();
    let visibleCount = 0;
    for (const { el, file } of allItems) {
      const match = !q || file.basename.toLowerCase().includes(q);
      el.style.display = match ? "" : "none";
      if (match) visibleCount++;
    }
    titleEl.textContent = q
      ? t("noteDash.selectDash") + ` (${visibleCount}/${columnFiles.length})`
      : t("noteDash.selectDash") + ` (${columnFiles.length})`;
  });

  let outsideListenerInstalled = false;
  const closeOnOutside = (ev: MouseEvent) => {
    if (!dropdown.isConnected) {
      if (outsideListenerInstalled) {
        document.removeEventListener("mousedown", closeOnOutside);
        outsideListenerInstalled = false;
      }
      return;
    }
    if (!dropdown.contains(ev.target as Node)) {
      dropdown.remove();
      if (outsideListenerInstalled) {
        document.removeEventListener("mousedown", closeOnOutside);
        outsideListenerInstalled = false;
      }
    }
  };

  cleanupFns.push(() => {
    if (outsideListenerInstalled) {
      document.removeEventListener("mousedown", closeOnOutside);
      outsideListenerInstalled = false;
    }
    dropdown.remove();
  });

  setTimeout(() => {
    document.addEventListener("mousedown", closeOnOutside);
    outsideListenerInstalled = true;
  }, 0);
}
