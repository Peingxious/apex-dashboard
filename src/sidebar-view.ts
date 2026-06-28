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
import { parse as parseMarkdown, serializeInto } from "./parser";
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

    // v1.4.10 — every callback below now uses the same
    // `SyncEngine.*Data` immutable helpers as the workbench and
    // the embedded view in `view.ts`, so the overlay / sidebar
    // view can no longer drift on the data-mutation step.
    // The previous implementation reached into the live card
    // via local `findColumn` / `findCard` helpers and mutated
    // the card in place, which had the same "stale card
    // reference" race as the embedded view.

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
        if (!self.data) return;
        // v1.4.10 — same `patchCardData` helper as the workbench
        // and the embedded view in `view.ts`. The previous
        // sidebar version reached into the live card via
        // `Object.assign(found.card, card)`, which had the
        // same "stale card reference" race as the embedded
        // view (modal holds a snapshot, findCard matches that
        // snapshot, in-place mutation goes to the wrong
        // object). The helper returns a NEW data object so
        // the next render starts from a clean column-tree.
        self.data = SyncEngine.patchCardData(self.data, card.id, card);
        await saveAndRefresh();
      },
      onCardDelete: async (cardId: string) => {
        if (!self.data) return;
        // v1.4.10 — same `removeCardData` helper as the workbench
        // and the embedded view. Replaces the inline
        // `splice(idx, 1)` mutation that was prone to leaving
        // the live `col.cards` array in a stale state.
        self.data = SyncEngine.removeCardData(self.data, cardId);
        await saveAndRefresh();
      },
      onCheckboxToggle: async (
        cardId: string,
        taskIndex: number,
        checked: boolean,
      ) => {
        if (!self.data) return;
        // v1.4.10 — same `toggleTaskData` helper as the
        // workbench / embedded view, so the
        // "checked-sinks-to-the-bottom" UX rule now applies
        // in the sidebar too.
        self.data = SyncEngine.toggleTaskData(
          self.data,
          cardId,
          taskIndex,
          checked,
        );
        await saveAndRefresh();
      },
      onTaskAdd: async (cardId: string, text: string) => {
        if (!self.data) return;
        self.data = SyncEngine.addTaskData(self.data, cardId, text);
        await saveAndRefresh();
      },
      onTaskDelete: async (cardId: string, taskIndex: number) => {
        if (!self.data) return;
        self.data = SyncEngine.deleteTaskData(self.data, cardId, taskIndex);
        await saveAndRefresh();
      },
      onTaskReorder: async (
        cardId: string,
        fromIndex: number,
        toIndex: number,
      ) => {
        if (!self.data) return;
        self.data = SyncEngine.reorderTaskData(
          self.data,
          cardId,
          fromIndex,
          toIndex,
        );
        await saveAndRefresh();
      },
      onTaskMoveToCard: async (
        srcCardId: string,
        taskIndex: number,
        destCardId: string,
        destIndex: number,
      ) => {
        if (!self.data) return;
        self.data = SyncEngine.moveTaskToCardData(
          self.data,
          srcCardId,
          taskIndex,
          destCardId,
          destIndex,
        );
        await saveAndRefresh();
      },
      onTaskEdit: async (
        cardId: string,
        taskIndex: number,
        newText: string,
      ) => {
        if (!self.data) return;
        self.data = SyncEngine.editTaskData(
          self.data,
          cardId,
          taskIndex,
          newText,
        );
        await saveAndRefresh();
      },
      onCardAdd: async (columnName: string, options?: { title?: string }) => {
        if (!self.data) return;
        const col = self.data.columns.find((c) => c.name === columnName);
        if (!col) return;
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
            const linkPath = (
              hashIdx >= 0 ? linkPart.slice(0, hashIdx) : linkPart
            ).trim();
            if (linkPath) {
              // Use Obsidian's standard link resolver for wikilinks
              // (handles basename-only links correctly, unlike plain
              // getFileByPath which requires a full vault path).
              const resolved = self.app.metadataCache.getFirstLinkpathDest(
                linkPath,
                self.overlayNotePath ?? "",
              );
              if (resolved instanceof TFile) {
                sourceFile = resolved;
              }
            }
          }
          if (sourceFile) {
            await ensureTodoPlusHeading(self.app, sourceFile, "To-do");
          }
          // v1.4.10 — funnel through the same `addCardData` helper
          // as the workbench / embedded view, so the structural
          // baseline (id, type, progress, size, grid, …) is
          // defined in one place. The sectionType-specific
          // `title` / `type: "todoplus"` override is layered on
          // top via the `overrides` argument.
          self.data = SyncEngine.addCardData(self.data, columnName, {
            id: `${Date.now()}-todoplus`,
            title: initialTitle,
            type: "todoplus",
          });
          await saveAndRefresh();
        } else {
          // v1.4.10 — same `addCardData` helper as the workbench /
          // embedded view. The `effectiveType`-derived `title` /
          // `type` / `tasks` overrides are layered on top.
          self.data = SyncEngine.addCardData(self.data, columnName, {
            id: `${Date.now()}-new`,
            title:
              effectiveType === "memo"
                ? t("default.memoTitle", { date: "" })
                : t("default.todoTitle1"),
            type: effectiveType === "memo" ? "generic" : "task",
            tasks:
              effectiveType === "todo" ? [{ text: "", checked: false }] : [],
          });
          await saveAndRefresh();
        }
      },
      onColumnAdd: async (name: string, sectionType?: string) => {
        if (!self.data) return;
        // v1.4.10 — same `addColumnData` helper as the workbench
        // and the embedded view, so the default color /
        // sectionType fallback ("project") is defined in one
        // place. The previous sidebar version re-implemented
        // the push inline and could drift on the default
        // color or the sectionType fallback rules.
        self.data = SyncEngine.addColumnData(
          self.data,
          name,
          sectionType || "project",
        );
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
        // v1.4.10 — same `moveCardData` helper as the workbench
        // and the embedded view. The previous sidebar version
        // re-implemented the move inline with two separate
        // `col.cards.splice` calls and a manual
        // `movedCard.column = targetColumn` assignment — the
        // helper does the same thing atomically and clamps
        // `targetIndex` to the destination column's length.
        self.data = SyncEngine.moveCardData(
          self.data,
          cardId,
          targetColumn,
          targetIndex,
        );
        await saveAndRefresh();
      },
      onMemoUpdate: async (
        card: DashboardCard,
        updates: { body: string; blockquote: string },
      ) => {
        if (!self.data) return;
        // v1.4.10 — same `patchCardData` helper as the
        // workbench / embedded view, so the body + blockquote
        // update goes through the same immutable path.
        self.data = SyncEngine.patchCardData(self.data, card.id, updates);
        await saveAndRefresh();
      },
      onProjectDocsUpdate: () => {},
      onProjectDocsReorder: () => {},
      onDocMoveToCard: () => {},
      onProjectDocsAdd: () => {},
      onProjectDocsRemove: () => {},
      onMemoColorChange: async (card: DashboardCard, color: string) => {
        if (!self.data) return;
        // v1.4.10 — same `patchCardData` helper as the
        // workbench / embedded view.
        self.data = SyncEngine.patchCardData(self.data, card.id, { color });
        await saveAndRefresh();
      },
      onProjectCoverChange: async (card: DashboardCard, imagePath: string) => {
        if (!self.data) return;
        // v1.4.10 — same `patchCardData` helper.
        self.data = SyncEngine.patchCardData(self.data, card.id, {
          coverImage: imagePath,
        });
        await saveAndRefresh();
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
          if (!self.data) return;
          // v1.4.10 — same `patchCardData` helper as the
          // workbench / embedded view, so the "convert to note"
          // body re-derivation goes through the same immutable
          // path. The body is now the wikilink to the new note
          // and the blockquote is reset to empty.
          self.data = SyncEngine.patchCardData(self.data, card.id, {
            body: buildMemoLinkedBody(targetPath),
            blockquote: "",
          });
          await saveAndRefresh();
          new Notice(t("memo.converted", { path: targetPath }));
        } catch (e) {
          new Notice(t("memo.convertError", { message: (e as Error).message }));
        }
      },
      onCardTitleEdit: async (cardId: string, newTitle: string) => {
        if (!self.data) return;
        // v1.4.10 — same `patchCardData` helper as the
        // workbench / embedded view.
        self.data = SyncEngine.patchCardData(self.data, cardId, {
          title: newTitle,
        });
        await saveAndRefresh();
      },
      onCardWidthChange: async (cardId: string, width: number) => {
        if (!self.data) return;
        self.data = SyncEngine.patchCardData(self.data, cardId, { width });
        await saveAndRefresh();
      },
      onCardSizeChange: async (cardId: string, size: CardSize) => {
        if (!self.data) return;
        self.data = SyncEngine.patchCardData(self.data, cardId, { size });
        await saveAndRefresh();
      },
      onCardGridChange: async (
        cardId: string,
        gridCols: number,
        gridRows: number,
      ) => {
        if (!self.data) return;
        self.data = SyncEngine.patchCardData(self.data, cardId, {
          gridCols,
          gridRows,
        });
        await saveAndRefresh();
      },
      onCardGridMove: async (
        cardId: string,
        gridCol: number,
        gridRow: number,
      ) => {
        if (!self.data) return;
        self.data = SyncEngine.patchCardData(self.data, cardId, {
          gridCol,
          gridRow,
        });
        await saveAndRefresh();
      },
      onFileDrop: () => {},
      onProjectItemReorder: () => {},
      onProjectItemMoveToCard: () => {},
      onProjectItemDelete: () => {},
      onColumnRename: async (oldName: string, newName: string) => {
        if (!self.data) return;
        // v1.4.10 — same `renameColumnData` helper as the
        // workbench / embedded view, so the rename also
        // re-points the matching `card.column` field on
        // every card in the column.
        self.data = SyncEngine.renameColumnData(self.data, oldName, newName);
        await saveAndRefresh();
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
        // v1.4.10 — same `deleteColumnData` helper as the
        // workbench / embedded view.
        self.data = SyncEngine.deleteColumnData(self.data, columnName);
        await saveAndRefresh();
      },
      onColumnSectionTypeChange: async (
        columnName: string,
        sectionType: string,
      ) => {
        if (!self.data) return;
        // v1.4.10 — same `setColumnSectionTypeData` helper as
        // the workbench / embedded view, which now bundles
        // the sectionType change AND the per-card migration
        // (type / tasks / projectDocs shape) into a single
        // immutable step. The previous sidebar version only
        // flipped `col.sectionType` and re-derived
        // `col.cards` via `migrateCardsForSectionType`, which
        // was correct in isolation but lived in three
        // separate call sites (workbench, embedded,
        // sidebar) — easy to drift on edge cases.
        const next = SyncEngine.setColumnSectionTypeData(
          self.data,
          columnName,
          sectionType,
        );
        if (next === self.data) return;
        self.data = next;
        await saveAndRefresh();
      },
      onColumnArchiveCompletedChange: async (
        columnName: string,
        archive: boolean,
      ) => {
        if (!self.data) return;
        // Sidebar view: writes through `saveAndRefresh` so the
        // new `archiveCompleted: bool` is persisted in the
        // dashboard file's `columns:` block on the next save —
        // this is the user-facing behaviour requested in v1.4.6
        // ("todo / todoplus: hide the entire card when all tasks
        // are completed; default on; persisted in the column's
        // properties"). v1.4.10 — same `setColumnArchiveCompletedData`
        // helper as the workbench / embedded view.
        self.data = SyncEngine.setColumnArchiveCompletedData(
          self.data,
          columnName,
          archive,
        );
        await saveAndRefresh();
      },
      onTaskReminderEdit: async (
        cardId: string,
        taskIndex: number,
        reminder: string | undefined,
      ) => {
        if (!self.data) return;
        // v1.4.10 — same `editTaskReminderData` helper as the
        // workbench / embedded view, including the
        // "empty string → undefined" normalisation.
        self.data = SyncEngine.editTaskReminderData(
          self.data,
          cardId,
          taskIndex,
          reminder,
        );
        await saveAndRefresh();
      },
      onTaskHideCompletedChange: async (cardId: string, hide: boolean) => {
        if (!self.data) return;
        // v1.4.10 — same `patchCardData` helper.
        self.data = SyncEngine.patchCardData(self.data, cardId, {
          hideCompleted: hide,
        });
        self.render();
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
