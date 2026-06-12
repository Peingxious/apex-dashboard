import { Plugin, moment, Notice, TFile } from "obsidian";
import { DashboardSettings, DEFAULT_SETTINGS } from "./types";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./view";
import { DashboardSettingTab } from "./settings";
import { SidebarView, SIDEBAR_VIEW_TYPE } from "./sidebar-view";
import { setLanguage, t, type Language } from "./i18n";

export default class DashboardPlugin extends Plugin {
  settings: DashboardSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Auto-detect system language on first run
    const savedData = await this.loadData();
    if (!savedData || savedData.language === undefined) {
      const systemLang = this.detectSystemLanguage();
      this.settings.language = systemLang;
      await this.saveSettings();
    }

    // Apply language setting
    setLanguage(this.settings.language);

    // Register the dashboard view
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new DashboardView(leaf, this),
    );

    // Register the shared sidebar view
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, this));

    // Add settings tab
    this.addSettingTab(new DashboardSettingTab(this.app, this));

    // Ribbon icon to open dashboard
    this.addRibbonIcon("home", "Open Dashboard", () => {
      this.activateView();
    });

    // Command to open dashboard (with hotkey: Ctrl+Alt+Shift+Z)
    this.addCommand({
      id: "open-dashboard",
      name: t("command.openDashboard"),
      hotkeys: [
        {
          modifiers: ["Mod", "Alt", "Shift"],
          key: "Z",
        },
      ],
      callback: () => {
        this.activateView();
      },
    });

    // Command: Toggle the shared dashboard sidebar
    this.addCommand({
      id: "toggle-dashboard-sidebar",
      name: t("command.toggleSidebar"),
      callback: () => {
        this.toggleSidebar();
      },
    });

    // Command: Convert current note headings to dashboard columns (no page open)
    this.addCommand({
      id: "convert-note-to-dashboard",
      name: t("command.convertToDashboard"),
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.convertNoteToDashboard(activeFile.path);
          }
          return true;
        }
        return false;
      },
    });

    // Command: Restore note from dashboard view (remove dashboard frontmatter)
    this.addCommand({
      id: "restore-note-from-dashboard",
      name: t("command.restoreFromDashboard"),
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.restoreNoteFromDashboard(activeFile.path);
          }
          return true;
        }
        return false;
      },
    });

    // Command: Embed current note into dashboard workspace
    this.addCommand({
      id: "embed-note-in-dashboard",
      name: t("command.embedInDashboard"),
      hotkeys: [
        {
          modifiers: ["Mod", "Alt"],
          key: "D",
        },
      ],
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            this.embedNoteInDashboard(activeFile.path);
          }
          return true;
        }
        return false;
      },
    });

    // Command: Undo last delete (restores card / task / project item / column)
    this.addCommand({
      id: "undo-last-delete",
      name: t("undo.command"),
      hotkeys: [
        {
          modifiers: ["Mod"],
          key: "Z",
        },
      ],
      checkCallback: (checking) => {
        const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
        const view = leaves[0]?.view as DashboardView | undefined;
        if (view && view.canUndo()) {
          if (!checking) {
            void view.undoLast().then((label) => {
              if (label) {
                new Notice(label);
              } else {
                new Notice(t("undo.nothing"));
              }
            });
          }
          return true;
        }
        return false;
      },
    });
  }

  onunload(): void {
    // Cleanup handled by Obsidian
  }

  /**
   * Detect system language from Obsidian's locale or browser/OS language.
   * Returns 'zh' for Chinese, 'en' for everything else.
   */
  private detectSystemLanguage(): Language {
    // 1. Check Obsidian's translation language (most reliable)
    const obsidianLocale = moment.locale();
    if (obsidianLocale && obsidianLocale.startsWith("zh")) {
      return "zh";
    }

    // 2. Check browser/Electron navigator.language
    if (typeof navigator !== "undefined" && navigator.language) {
      if (navigator.language.startsWith("zh")) {
        return "zh";
      }
    }

    // 3. Default to English
    return "en";
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  refreshAllDashboards(): void {
    this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view as DashboardView;
      view.refresh();
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (
        workspace as unknown as { getLeaf: (...args: unknown[]) => typeof leaf }
      ).getLeaf("tab") as typeof leaf;
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  /** Open or reveal the shared dashboard sidebar (right side) */
  async activateSidebar(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (!leaf) {
      // Open in right sidebar
      leaf = (
        workspace as unknown as { getLeaf: (...args: unknown[]) => typeof leaf }
      ).getLeaf("tab", "right") as typeof leaf;
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  /** Toggle the shared dashboard sidebar on/off */
  async toggleSidebar(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (existing) {
      existing.detach();
    } else {
      await this.activateSidebar();
    }
  }

  /**
   * Open a floating dashboard overlay on the current note.
   * Renders kanban columns at the top of the active markdown view
   * without modifying the original file.
   * @param notePath - The path of the note to overlay kanban on
   */
  async openDashboardOverlay(notePath: string): Promise<void> {
    const { workspace } = this.app;
    // Find or create an overlay leaf (using the right sidebar as container)
    let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (
        workspace as unknown as { getLeaf: (...args: unknown[]) => typeof leaf }
      ).getLeaf("tab", "right") as typeof leaf;
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);

    // Notify the sidebar view to show overlay mode for this note
    const view = leaf.view as SidebarView;
    view.showOverlayForNote(notePath);
  }

  /**
   * Scan the current note for ## headings, extract them as columns,
   * write them to the file's frontmatter, and open in dashboard overlay.
   */
  async convertNoteToDashboard(notePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile) || !file.path.endsWith(".md")) {
      new Notice("Only markdown files can be converted to dashboard");
      return;
    }

    const content = await this.app.vault.read(file);
    const noteName = file.basename;
    const headings = this.extractH2Headings(content, noteName);

    if (headings.length === 0) {
      new Notice(t("sidebar.noHeadings"));
      return;
    }

    // Build the new frontmatter with columns
    const newFrontmatter = this.buildColumnFrontmatter(headings);
    const newContent = this.injectFrontmatter(content, newFrontmatter);

    // Write back to file
    await this.app.vault.modify(file, newContent);

    new Notice(t("sidebar.converted", { count: headings.length }));
    this.refreshAllDashboards();
  }

  /**
   * Extract all ## headings from markdown content.
   * Skips the file's self-reference heading (e.g., ## [[文件名]] or ## 文件名).
   */
  private extractH2Headings(content: string, noteName: string): string[] {
    const headings: string[] = [];
    const lines = content.split("\n");
    const selfRefExact = new Set([noteName, `[[${noteName}]]`]);
    const selfRefPrefix = `[[${noteName}|`;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("## ")) {
        const heading = trimmed.slice(3).trim();
        // Skip self-reference heading (file name self-embed)
        const isSelfRef =
          selfRefExact.has(heading) || heading.startsWith(selfRefPrefix);
        if (!isSelfRef) {
          headings.push(heading);
        }
      }
    }
    return headings;
  }

  /**
   * Build YAML frontmatter string for columns.
   */
  private buildColumnFrontmatter(headings: string[]): string {
    const lines: string[] = [];
    lines.push("---");
    lines.push("columns:");
    for (const heading of headings) {
      // Escape quotes in heading names
      const escaped = heading.replace(/"/g, '\\"');
      lines.push(`  - name: "${escaped}"`);
    }
    lines.push("---");
    return lines.join("\n");
  }

  /**
   * Inject or replace frontmatter in markdown content.
   */
  private injectFrontmatter(content: string, frontmatter: string): string {
    const trimmed = content.trim();

    // Check if frontmatter already exists
    if (trimmed.startsWith("---")) {
      const endIdx = trimmed.indexOf("---", 3);
      if (endIdx !== -1) {
        // Replace existing frontmatter
        const body = trimmed.slice(endIdx + 3).trim();
        return frontmatter + "\n\n" + body;
      }
    }

    // Prepend new frontmatter
    return frontmatter + "\n\n" + trimmed;
  }

  /**
   * Remove dashboard frontmatter from note and restore as plain note.
   */
  async restoreNoteFromDashboard(notePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile) || !file.path.endsWith(".md")) {
      new Notice(t("sidebar.noFrontmatter"));
      return;
    }

    const content = await this.app.vault.read(file);

    // Check if has frontmatter
    const trimmed = content.trim();
    if (!trimmed.startsWith("---")) {
      new Notice(t("sidebar.noFrontmatter"));
      return;
    }

    const endIdx = trimmed.indexOf("---", 3);
    if (endIdx === -1) {
      new Notice(t("sidebar.noFrontmatter"));
      return;
    }

    const frontmatterBlock = trimmed.slice(0, endIdx + 3);
    const body = trimmed.slice(endIdx + 3).trim();

    // Check if it's a dashboard frontmatter
    if (
      !frontmatterBlock.includes("dashboard:") &&
      !frontmatterBlock.includes("columns:")
    ) {
      new Notice(t("sidebar.noFrontmatter"));
      return;
    }

    // Remove the frontmatter
    await this.app.vault.modify(file, body);

    new Notice(t("sidebar.restored"));
    this.refreshAllDashboards();

    // Exit overlay mode if active
    const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as SidebarView;
      if (view) {
        (view as any).exitOverlayMode?.();
      }
    }
  }

  /**
   * Embed a note's dashboard into the main workspace dashboard view.
   */
  async embedNoteInDashboard(notePath: string): Promise<void> {
    const { workspace } = this.app;

    // Find or create the main dashboard view
    let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (
        workspace as unknown as { getLeaf: (...args: unknown[]) => typeof leaf }
      ).getLeaf("tab") as typeof leaf;
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);

    // Embed the note into the dashboard
    const view = leaf.view as DashboardView;
    await view.embedNoteDashboard(notePath);
  }
}
