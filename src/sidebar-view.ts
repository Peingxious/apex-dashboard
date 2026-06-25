import { ItemView, WorkspaceLeaf, setIcon, Notice, TFile } from "obsidian";
import type DashboardPlugin from "./main";
import type { DashboardData, DashboardCard, CardSize } from "./types";
import { SyncEngine } from "./sync";
import {
  renderSidebarWidgets,
  renderSidebarWeekCalendar,
  renderDashboard,
  renderSidebarPomodoro,
  renderSidebarReading,
  ensureTodoPlusHeading,
} from "./renderer";
import { loadHolidayData, renderSidebarLunarWidget } from "./lunar-widget";
import { t } from "./i18n";
import type { HolidayInfo } from "./holiday-service";
import { PomodoroService } from "./pomodoro-service";
import { ReadingService } from "./reading-service";
import {
  parse as parseMarkdown,
  serializeInto,
  migrateCardsForSectionType,
} from "./parser";
import {
  buildMemoLinkedBody,
  buildMemoNoteContent,
  buildMemoNotePath,
} from "./memo-convert";

export const SIDEBAR_VIEW_TYPE = "peingxious-dashboard-sidebar";

export class SidebarView extends ItemView {
  private plugin: DashboardPlugin;
  private sync: SyncEngine;
  private data: DashboardData | null = null;
  private cleanupFns: Array<() => void> = [];
  private holidayData: Record<string, HolidayInfo> = {};
  private pomodoroService: PomodoroService | null = null;
  private readingService: ReadingService | null = null;

  /** Overlay mode: path of the note currently overlaid with kanban */
  private overlayNotePath: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sync = new SyncEngine(this.app, plugin.settings);
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("sidebar.viewName");
  }

  getIcon(): string {
    return "layoutDashboard";
  }

  async onOpen(): Promise<void> {
    this.sync.updateSettings(this.plugin.settings);
    this.sync.onDataUpdate((data) => {
      this.data = data;
      this.render();
    });
    await this.sync.init();

    this.pomodoroService = new PomodoroService(this.plugin);
    this.readingService = new ReadingService(this.plugin);

    this.holidayData = await loadHolidayData();
  }

  onResize(): void {
    this.render();
  }

  async onClose(): Promise<void> {
    this.sync.destroy();
    for (const fn of this.cleanupFns) {
      fn?.();
    }
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();

    if (this.overlayNotePath) {
      this.renderOverlayMode(container);
      return;
    }

    const wrapper = container.createDiv({
      cls: "peingxious-dashboard-sidebar",
    });

    // Header with icon and title
    const header = wrapper.createDiv({ cls: "sidebar-header" });
    header.createEl("h3", { text: t("sidebar.viewName") });

    renderSidebarWidgets(
      wrapper,
      this.plugin.settings,
      this.app,
      this.pomodoroService ?? undefined,
      this.readingService ?? undefined,
    );
    renderSidebarLunarWidget(wrapper, this.holidayData, this.app);
    if (this.pomodoroService)
      renderSidebarPomodoro(
        wrapper,
        this.pomodoroService,
        this.plugin.settings,
      );
    if (this.readingService) renderSidebarReading(wrapper, this.readingService);
    renderSidebarWeekCalendar(wrapper);

    if (this.data) {
      // v1.4.x R5 — pass the dashboard's host file path so wikilink
      // hover preview resolves against the same file (not against
      // whatever markdown the user has open in the main pane). The
      // sidebar's data mirrors the main dashboard view, so the host
      // is `plugin.sync.getFile()` — same as in `DashboardView`.
      const hostSourcePath = this.sync.getFile()?.path;
      renderDashboard(
        wrapper,
        this.data,
        this.createMainCallbacks(),
        this.app,
        this.plugin.settings,
        hostSourcePath,
      );
    } else {
      wrapper.createEl("p", {
        cls: "sidebar-empty",
        text: t("sidebar.noData"),
      });
    }
  }

  /**
   * Called by the plugin when the user activates "add dashboard to note".
   * Parses the note's markdown content directly to build dashboard columns.
   */
  async showOverlayForNote(notePath: string): Promise<void> {
    this.overlayNotePath = notePath;

    // Read and parse the note's content directly
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile) || !file.path.endsWith(".md")) {
      new Notice("Cannot read this file as markdown");
      this.exitOverlayMode();
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const parsedData = parseMarkdown(content);

      // If note has columns defined, use them directly
      if (parsedData.columns && parsedData.columns.length > 0) {
        this.data = parsedData;
        new Notice(
          t("sidebar.overlayActive", { note: notePath.split("/").pop() ?? "" }),
        );
      } else {
        // No columns defined, exit overlay mode
        new Notice(
          'This note has no dashboard columns. Run "Convert Note Headings to Dashboard Columns" first.',
        );
        this.exitOverlayMode();
        return;
      }
    } catch (err) {
      new Notice("Error reading note content");
      this.exitOverlayMode();
      return;
    }

    this.render();
  }

  private renderOverlayMode(container: HTMLElement): void {
    container.addClass("peingxious-dashboard-overlay-root");

    const overlayEl = container.createDiv({ cls: "dashboard-overlay" });

    // Header
    const header = overlayEl.createDiv({ cls: "dashboard-overlay-header" });
    header.createEl("span", {
      cls: "dashboard-overlay-title",
      text: t("sidebar.overlayTitle", {
        note: this.overlayNotePath?.split("/").pop() ?? "",
      }),
    });

    // Exit button
    const exitBtn = header.createEl("button", {
      cls: "dashboard-overlay-exit-btn",
    });
    setIcon(exitBtn, "x");
    exitBtn.title = t("sidebar.exitOverlay");
    exitBtn.addEventListener("click", () => this.exitOverlayMode());

    // Kanban columns - use parsed data from the note
    const kanban = overlayEl.createDiv({ cls: "dashboard-overlay-kanban" });

    if (this.data && this.data.columns.length > 0) {
      const noteData: DashboardData = {
        banner: this.data.banner,
        quickActions: this.data.quickActions ?? [],
        columns: this.data.columns,
      };
      renderDashboard(
        kanban,
        noteData,
        this.createOverlayCallbacks(),
        this.app,
        this.plugin.settings,
        // v1.4.x R5 — in overlay mode the dashboard's data is
        // embedded in the target note, so the host file is that
        // note (not the main dashboard's own file).
        this.overlayNotePath ?? undefined,
      );
    } else {
      kanban.createEl("p", { text: "No columns defined in this note" });
    }
  }

  /** Create callbacks for main sidebar (read-only, delegates to main dashboard) */
  private createMainCallbacks() {
    return {
      onCardEdit: (card: DashboardCard) => {
        this.plugin.refreshAllDashboards();
      },
      onCardDelete: async () => {},
      onCheckboxToggle: () => {
        this.plugin.refreshAllDashboards();
      },
      onTaskAdd: () => {
        this.plugin.refreshAllDashboards();
      },
      onTaskDelete: async () => {},
      onTaskReorder: () => {},
      onTaskMoveToCard: () => {},
      onTaskEdit: () => {
        this.plugin.refreshAllDashboards();
      },
      onTaskHideCompletedChange: () => {
        this.plugin.refreshAllDashboards();
      },
      onCardAdd: () => {},
      onColumnAdd: () => {},
      onBannerEdit: () => {},
      onQuickActionAdd: () => {},
      onQuickActionRemove: () => {},
      onMoveCard: () => {},
      onMemoUpdate: () => {},
      onProjectDocsUpdate: () => {},
      onProjectDocsReorder: () => {},
      onDocMoveToCard: () => {},
      onProjectDocsAdd: () => {},
      onProjectDocsRemove: () => {},
      onMemoColorChange: () => {},
      onProjectCoverChange: () => {},
      onMemoConvertToNote: () => {},
      onCardTitleEdit: () => {},
      onCardWidthChange: () => {},
      onCardSizeChange: () => {},
      onCardGridChange: () => {},
      onCardGridMove: () => {},
      onFileDrop: () => {},
      onProjectItemReorder: () => {},
      onProjectItemMoveToCard: () => {},
      onProjectItemDelete: () => {},
      onColumnRename: () => {},
      onColumnDelete: () => {},
      onColumnSectionTypeChange: () => {},
      onColumnArchiveCompletedChange: () => {},
      onTaskReminderEdit: () => {},
      onProjectGroupAdd: () => {},
      onAddFromTemplate: () => {},
      onLibraryConfigChange: () => {},
    };
  }

  /**
   * Create fully functional callbacks for overlay/note-level dashboard.
   * All changes are written back directly to the note file using parser.serialize().
   */
  private createOverlayCallbacks() {
    const self = this;

    function findColumn(name: string) {
      return self.data?.columns.find((c) => c.name === name);
    }

    function findCard(
      cardId: string,
    ): { col: import("./types").DashboardColumn; card: DashboardCard } | null {
      if (!self.data) return null;
      for (const col of self.data.columns) {
        const card = col.cards.find((c) => c.id === cardId);
        if (card) return { col, card };
      }
      return null;
    }

    async function saveAndRefresh(): Promise<void> {
      if (!self.data || !self.overlayNotePath) return;
      const file = self.app.vault.getAbstractFileByPath(self.overlayNotePath);
      if (!(file instanceof TFile)) return;
      try {
        const current = await self.app.vault.read(file);
        const newContent = serializeInto(current, self.data);
        await self.app.vault.modify(file, newContent);
        self.render();
      } catch (e) {
        new Notice("Error saving changes");
      }
    }

    return {
      onCardEdit: async (card: DashboardCard) => {
        const found = findCard(card.id);
        if (found) {
          Object.assign(found.card, card);
          await saveAndRefresh();
        }
      },
      onCardDelete: async (cardId: string) => {
        if (!self.data) return;
        for (const col of self.data.columns) {
          const idx = col.cards.findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            col.cards.splice(idx, 1);
            break;
          }
        }
        await saveAndRefresh();
      },
      onCheckboxToggle: async (
        cardId: string,
        taskIndex: number,
        checked: boolean,
      ) => {
        const found = findCard(cardId);
        if (found && found.card.tasks[taskIndex]) {
          found.card.tasks[taskIndex].checked = checked;
          await saveAndRefresh();
        }
      },
      onTaskAdd: async (cardId: string, text: string) => {
        const found = findCard(cardId);
        if (found) {
          found.card.tasks.push({ text, checked: false });
          await saveAndRefresh();
        }
      },
      onTaskDelete: async (cardId: string, taskIndex: number) => {
        const found = findCard(cardId);
        if (found && found.card.tasks[taskIndex]) {
          found.card.tasks.splice(taskIndex, 1);
          await saveAndRefresh();
        }
      },
      onTaskReorder: async (
        cardId: string,
        fromIndex: number,
        toIndex: number,
      ) => {
        const found = findCard(cardId);
        if (found && fromIndex !== toIndex) {
          const [item] = found.card.tasks.splice(fromIndex, 1);
          found.card.tasks.splice(toIndex, 0, item);
          await saveAndRefresh();
        }
      },
      onTaskMoveToCard: async (
        srcCardId: string,
        taskIndex: number,
        destCardId: string,
        destIndex: number,
      ) => {
        const srcFound = findCard(srcCardId);
        const destFound = findCard(destCardId);
        if (srcFound && destFound) {
          const [task] = srcFound.card.tasks.splice(taskIndex, 1);
          destFound.card.tasks.splice(destIndex, 0, task);
          await saveAndRefresh();
        }
      },
      onTaskEdit: async (
        cardId: string,
        taskIndex: number,
        newText: string,
      ) => {
        const found = findCard(cardId);
        if (found && found.card.tasks[taskIndex]) {
          found.card.tasks[taskIndex].text = newText;
          await saveAndRefresh();
        }
      },
      onCardAdd: async (columnName: string, options?: { title?: string }) => {
        const col = findColumn(columnName);
        if (!col || !self.data) return;
        const effectiveType = col.sectionType ?? columnName.toLowerCase();

        if (effectiveType === "todoplus") {
          const initialTitle = options?.title?.trim() ?? "";
          // Resolve the source file from the wikilink title (same logic
          // as in view.ts) so we can auto-append `## To-do` idempotently.
          let sourceFile: TFile | null = null;
          if (initialTitle) {
            const text = initialTitle.trim();
            const inner = text.replace(/^\[\[/, "").replace(/]]$/, "").trim();
            const pipeIdx = inner.indexOf("|");
            const linkPart = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
            const hashIdx = linkPart.indexOf("#");
            const linkPath = (hashIdx >= 0 ? linkPart.slice(0, hashIdx) : linkPart).trim();
            if (linkPath) {
              // Use Obsidian's standard link resolver for wikilinks
              // (handles basename-only links correctly, unlike plain
              // getFileByPath which requires a full vault path).
              const resolved = self.app.metadataCache.getFirstLinkpathDest(linkPath, self.overlayNotePath ?? "");
              if (resolved instanceof TFile) {
                sourceFile = resolved;
              }
            }
          }
          if (sourceFile) {
            await ensureTodoPlusHeading(self.app, sourceFile, "To-do");
          }
          col.cards.push({
            id: `${Date.now()}-todoplus`,
            title: initialTitle,
            type: "todoplus",
            column: columnName,
            body: "",
            tasks: [],
            url: "",
            wikiLink: "",
            progress: -1,
            streak: 0,
            dueDate: "",
            blockquote: "",
            color: "",
            coverImage: "",
            width: 0,
            size: "M",
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
            hideCompleted: false,
          });
          await saveAndRefresh();
        } else {
          const newCard: DashboardCard = {
            id: `${Date.now()}-new`,
            title:
              effectiveType === "memo"
                ? t("default.memoTitle", { date: "" })
                : t("default.todoTitle1"),
            type: effectiveType === "memo" ? "generic" : "task",
            column: columnName,
            body: "",
            tasks:
              effectiveType === "todo" ? [{ text: "", checked: false }] : [],
            url: "",
            wikiLink: "",
            progress: -1,
            streak: 0,
            dueDate: "",
            blockquote: "",
            color: "",
            coverImage: "",
            width: 0,
            size: "M",
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
            hideCompleted: false,
          };
          col.cards.push(newCard);
          await saveAndRefresh();
        }
      },
      onColumnAdd: async (name: string, sectionType?: string) => {
        if (!self.data) return;
        self.data.columns.push({
          name,
          color: "#6366f1",
          sectionType: sectionType || "project",
          cards: [],
        });
        await saveAndRefresh();
      },
      onBannerEdit: () => {},
      onQuickActionAdd: () => {},
      onQuickActionRemove: () => {},
      onMoveCard: async (
        cardId: string,
        targetColumn: string,
        targetIndex: number,
      ) => {
        if (!self.data) return;
        let movedCard: DashboardCard | null = null;
        for (const col of self.data.columns) {
          const idx = col.cards.findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            [movedCard] = col.cards.splice(idx, 1);
            break;
          }
        }
        if (!movedCard) return;
        const destCol = findColumn(targetColumn);
        if (destCol) {
          movedCard.column = targetColumn;
          destCol.cards.splice(targetIndex, 0, movedCard);
          await saveAndRefresh();
        }
      },
      onMemoUpdate: async (
        card: DashboardCard,
        updates: { body: string; blockquote: string },
      ) => {
        const found = findCard(card.id);
        if (found) {
          found.card.body = updates.body;
          found.card.blockquote = updates.blockquote;
          await saveAndRefresh();
        }
      },
      onProjectDocsUpdate: () => {},
      onProjectDocsReorder: () => {},
      onDocMoveToCard: () => {},
      onProjectDocsAdd: () => {},
      onProjectDocsRemove: () => {},
      onMemoColorChange: async (card: DashboardCard, color: string) => {
        const found = findCard(card.id);
        if (found) {
          found.card.color = color;
          await saveAndRefresh();
        }
      },
      onProjectCoverChange: async (card: DashboardCard, imagePath: string) => {
        const found = findCard(card.id);
        if (found) {
          found.card.coverImage = imagePath;
          await saveAndRefresh();
        }
      },
      onMemoConvertToNote: async (card: DashboardCard) => {
        // Convert a Memo card to a standalone note in the vault's
        // default new-file location. Mirrors the main/embedded
        // view implementations; the original card stays put.
        try {
          const baseName = buildMemoNotePath(card.title || "Untitled");
          let targetPath: string;
          try {
            targetPath =
              await this.app.fileManager.getAvailablePathForAttachment(
                `${baseName}.md`,
                "md",
              );
          } catch {
            targetPath = `${baseName}.md`;
          }
          const content = buildMemoNoteContent(card);
          await this.app.vault.create(targetPath, content);
          const found = findCard(card.id);
          if (found) {
            found.card.body = buildMemoLinkedBody(targetPath);
            found.card.blockquote = "";
            await saveAndRefresh();
          }
          new Notice(t("memo.converted", { path: targetPath }));
        } catch (e) {
          new Notice(
            t("memo.convertError", { message: (e as Error).message }),
          );
        }
      },
      onCardTitleEdit: async (cardId: string, newTitle: string) => {
        const found = findCard(cardId);
        if (found) {
          found.card.title = newTitle;
          await saveAndRefresh();
        }
      },
      onCardWidthChange: async (cardId: string, width: number) => {
        const found = findCard(cardId);
        if (found) {
          found.card.width = width;
          await saveAndRefresh();
        }
      },
      onCardSizeChange: async (cardId: string, size: CardSize) => {
        const found = findCard(cardId);
        if (found) {
          found.card.size = size;
          await saveAndRefresh();
        }
      },
      onCardGridChange: async (
        cardId: string,
        gridCols: number,
        gridRows: number,
      ) => {
        const found = findCard(cardId);
        if (found) {
          found.card.gridCols = gridCols;
          found.card.gridRows = gridRows;
          await saveAndRefresh();
        }
      },
      onCardGridMove: async (
        cardId: string,
        gridCol: number,
        gridRow: number,
      ) => {
        const found = findCard(cardId);
        if (found) {
          found.card.gridCol = gridCol;
          found.card.gridRow = gridRow;
          await saveAndRefresh();
        }
      },
      onFileDrop: () => {},
      onProjectItemReorder: () => {},
      onProjectItemMoveToCard: () => {},
      onProjectItemDelete: () => {},
      onColumnRename: async (oldName: string, newName: string) => {
        const col = findColumn(oldName);
        if (col) {
          col.name = newName;
          await saveAndRefresh();
        }
      },
      onColumnDelete: async (columnName: string) => {
        // Protect first column and columns with tags/links
        if (self.data) {
          const idx = self.data.columns.findIndex((c) => c.name === columnName);
          if (
            idx === 0 ||
            columnName.includes("[[") ||
            columnName.includes("#")
          ) {
            new Notice(t("error.cannotDeleteMainColumn"));
            return;
          }
        }
        if (!self.data) return;
        const idx = self.data.columns.findIndex((c) => c.name === columnName);
        if (idx !== -1) {
          self.data.columns.splice(idx, 1);
          await saveAndRefresh();
        }
      },
      onColumnSectionTypeChange: async (
        columnName: string,
        sectionType: string,
      ) => {
        const col = findColumn(columnName);
        if (col) {
          // v1.4.10 — sectionType migration: same as the main /
          // embedded views, migrate the column's cards so the
          // in-memory shape and the on-disk shape match the new
          // sectionType. Without this the sidebar would silently
          // keep the old `card.type` / `card.tasks` even though the
          // header now says the new section, and the next save would
          // write a mix of formats inside a single column.
          col.sectionType = sectionType;
          col.cards = migrateCardsForSectionType(col.cards, sectionType);
          await saveAndRefresh();
        }
      },
      onColumnArchiveCompletedChange: async (
        columnName: string,
        archive: boolean,
      ) => {
        // Sidebar view: writes through `saveAndRefresh` so the new
        // `archiveCompleted: bool` is persisted in the dashboard
        // file's `columns:` block on the next save — this is the
        // user-facing behaviour requested in v1.4.6 ("todo /
        // todoplus: hide the entire card when all tasks are
        // completed; default on; persisted in the column's
        // properties").
        const col = findColumn(columnName);
        if (col) {
          col.archiveCompleted = archive;
          await saveAndRefresh();
        }
      },
      onTaskReminderEdit: async (
        cardId: string,
        taskIndex: number,
        reminder: string | undefined,
      ) => {
        const found = findCard(cardId);
        if (found && found.card.tasks[taskIndex]) {
          found.card.tasks[taskIndex].reminder = reminder;
          await saveAndRefresh();
        }
      },
      onTaskHideCompletedChange: async (cardId: string, hide: boolean) => {
        const found = findCard(cardId);
        if (found) {
          found.card.hideCompleted = hide;
          self.render();
        }
      },
      onProjectGroupAdd: () => {},
      onAddFromTemplate: () => {},
      onLibraryConfigChange: () => {},
    };
  }

  /** Exit overlay mode and return to normal sidebar */
  exitOverlayMode(): void {
    this.overlayNotePath = null;
    this.data = null;
    this.render();
  }
}
