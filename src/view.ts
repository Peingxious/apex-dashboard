import {
  ItemView,
  Menu,
  Notice,
  setIcon,
  WorkspaceLeaf,
  TFile,
  Events,
  App,
} from "obsidian";
import type DashboardPlugin from "./main";
import type {
  DashboardData,
  DashboardCard,
  QuickAction,
  BannerData,
  WeatherConfig,
  TrackerConfig,
  LibraryConfig,
} from "./types";
import { SyncEngine } from "./sync";
import {
  renderDashboard,
  destroyAllCharts,
  renderSidebarWidgets,
  renderSidebarWeekCalendar,
  renderSidebarPomodoro,
  renderSidebarReading,
  ensureTodoPlusHeading,
} from "./renderer";
import { disposeAllRenderers } from "./render/lifecycle";
import { closeAllFileSuggests } from "./file-suggest";
import { renderBanner, BannerEditModal } from "./banner";
import { getRecentDocs, renderRecentDocs } from "./recent";
import {
  renderQuickActions,
  AddActionModal,
  DocSearchModal,
} from "./quick-actions";
import { setupDragAndDrop } from "./dnd";
import { CardEditModal } from "./card-edit-modal";
import { showConfirmDialog } from "./confirm-dialog";
import { clearWeatherCache } from "./weather-service";
import { renderSidebarLunarWidget, loadHolidayData } from "./lunar-widget";
import type { HolidayInfo } from "./holiday-service";
import { WidgetTypeModal, type WidgetType } from "./widget-type-modal";
import { WeatherConfigModal } from "./weather-config-modal";
import { LibraryConfigModal } from "./library-config-modal";
import { TrackerConfigModal } from "./tracker-config-modal";
import { TemplatePickerModal } from "./template-modal";
import { PomodoroService } from "./pomodoro-service";
import { ReadingService } from "./reading-service";
import { ReminderNoticeModal } from "./reminder-notice";
import { t } from "./i18n";
import { parse, pathToWikiLink } from "./parser";
import {
  buildMemoLinkedBody,
  buildMemoNoteContent,
  buildMemoNotePath,
} from "./memo-convert";
import { RafCoalescer } from "./utils/raf-coalescer";
import { MOBILE_BREAKPOINT_PX, NAV_DBLCLICK_THRESHOLD_MS } from "./constants";
import { reportError } from "./utils/report";
import { showColumnFilePicker as showColumnFilePickerUI } from "./dashboard-view/column-file-picker";

export const DASHBOARD_VIEW_TYPE = "peingxious-dashboard-view";

export class DashboardView extends ItemView {
  private plugin: DashboardPlugin;
  private sync: SyncEngine;
  private data: DashboardData | null = null;
  private cleanupFns: Array<() => void> = [];
  private bannerHandles: Array<{ dispose: () => void }> = [];
  private vaultEventRefs: Array<{ evt: Events; ref: unknown }> = [];
  private recentDocsTimer: ReturnType<typeof setTimeout> | null = null;
  private libraryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RECENT_DOCS_DEBOUNCE = 500;
  private static readonly REMINDER_CHECK_MS = 60 * 1000; // 1 minute
  private reminderTimer: ReturnType<typeof setInterval> | null = null;
  private firedReminders = new Set<string>();
  private sidebarPinned: boolean;
  private sidebarExpanded = false;
  private bannerCollapsed =
    localStorage.getItem("peingxious-dashboard-banner-collapsed") !== "false";
  private pendingScrollCardId: string | null = null;
  private pendingScrollToLastCardOfColumn: string | null = null;
  private pomodoroService: PomodoroService | null = null;
  private readingService: ReadingService | null = null;
  private holidayData: Record<string, HolidayInfo> = {};
  private mobileWidgetExpanded: "pomodoro" | "reading" | "lunar" | null = null;
  private mobileWidgetTabsOpen: boolean = false;
  private static readonly WEATHER_REFRESH_MS = 30 * 60 * 1000; // 30 min
  private weatherRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private renderCoalescer = new RafCoalescer<DashboardData>();

  // Generation counter for the nav-bar. Bumped on every
  // renderViewNavBar() call. Pending clickTimer callbacks (set by
  // a tab button in a PREVIOUS render) check this generation before
  // firing embedNoteDashboard, so they no-op once the bar has been
  // re-rendered. Without this, a stale timer from a destroyed
  // button can re-render the view mid-dblclick and replace the
  // button the user is still trying to interact with.
  private navBarGeneration = 0;

  // Embedded note dashboard mode (tabs persisted in plugin.settings)
  private embeddedData: DashboardData | null = null;
  private embeddedDataCache = new Map<string, DashboardData>();

  // Suppress reload-on-modify when WE just wrote the embedded file
  // ourselves via saveEmbeddedAndRefresh. Without this flag the
  // vault 'modify' event would re-parse the file and re-render the
  // view a second time, racing with the in-place data mutation
  // and producing duplicate render cycles (and stale data in the
  // brief window between the two renders).
  private isWritingEmbeddedFile = false;

  /** Get current active tab path from settings */
  get embeddedNotePath(): string | null {
    return this.plugin.settings.activeEmbeddedNoteTab ?? null;
  }

  /** Set active tab path in settings */
  set embeddedNotePath(path: string | null) {
    this.plugin.settings.activeEmbeddedNoteTab = path;
    // Persist to disk so it survives reload
    this.plugin.saveSettings();
  }

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sync = new SyncEngine(this.app, this.plugin.settings);
    // Use saved preference, or fall back to settings default
    const saved = localStorage.getItem("peingxious-dashboard-sidebar-pinned");
    this.sidebarPinned =
      saved !== null ? saved === "true" : plugin.settings.sidebarPinnedDefault;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("main.dashboard");
  }

  getIcon(): string {
    return "home";
  }

  async onOpen(): Promise<void> {
    this.sync.updateSettings(this.plugin.settings);
    this.sync.onDataUpdate((data) => this.requestRender(data));

    await this.sync.init();
    this.registerVaultListeners();
    this.registerUndoShortcut();
    this.startReminderChecker();
    this.startWeatherRefresh();
    this.pomodoroService = new PomodoroService(this.plugin);
    await this.pomodoroService.loadSessions();
    this.readingService = new ReadingService(this.plugin);
    await this.readingService.loadSessions();
    loadHolidayData().then((data) => {
      this.holidayData = data;
      const currentData = this.sync.getData();
      if (currentData) this.requestRender(currentData);
    });

    // Restore last active embedded note tab if any
    const savedTab = this.plugin.settings.activeEmbeddedNoteTab;
    if (savedTab) {
      this.reenterEmbeddedMode(savedTab);
    }
  }

  async onClose(): Promise<void> {
    this.renderCoalescer.cancel();
    this.runCleanup();
    this.unregisterVaultListeners();
    this.stopReminderChecker();
    this.stopWeatherRefresh();
    // Step 8.3 (v1.5.0) — fix LEAK-001 by tearing down every
    // document-level event listener that the render layer
    // installed via `RenderDisposer` during this view's lifetime.
    // Without this call, listeners from previous view open
    // sessions would accumulate on `document`.
    disposeAllRenderers();
    this.pomodoroService?.destroy();
    this.pomodoroService = null;
    this.readingService?.destroy();
    this.readingService = null;
    this.sync.destroy();
  }

  async refresh(): Promise<void> {
    this.sync.updateSettings(this.plugin.settings);
    const data = this.sync.getData();
    if (data) {
      this.requestRender(data);
    }
  }

  /**
   * Public undo hook: called by Ctrl/Cmd+Z and by the command-palette
   * command registered in main.ts. Returns a short human-readable
   * label for the action that was undone, or null when there is
   * nothing left to undo.
   */
  async undoLast(): Promise<string | null> {
    return this.sync.undo();
  }

  canUndo(): boolean {
    return this.sync.canUndo();
  }

  addSection(): void {
    const name = prompt(t("renderer.sectionName"));
    if (name?.trim()) {
      this.sync.addColumn(name.trim());
    }
  }

  private requestRender(data: DashboardData): void {
    this.renderCoalescer.schedule(data, (d) => this.render(d));
  }

  private render(data: DashboardData): void {
    this.runCleanup();
    this.data = data;
    this.firedReminders.clear();

    // Use embedded note data if in embedded mode
    const activeData = this.embeddedData ?? data;
    // v1.4.9 BUG-003a — diag: confirm render runs and which data ref
    // it's using. Remove after verify.
    console.log(
      "[apex-dashboard][diag] view.render called — embeddedMode=",
      !!this.embeddedNotePath,
      "activeDataId=",
      (activeData as any).__diagId ?? "(no id)",
      "sectionTypes=",
      activeData.columns
        .map((c) => `${c.name}:${c.sectionType ?? "?"}`)
        .join(","),
    );

    // Save scroll positions before re-render
    const root = this.containerEl.children[1] as HTMLElement;
    const kanbanEl = root?.querySelector(".dashboard-kanban");
    const sidebarScrollEl = root?.querySelector(".dashboard-sidebar-scroll");
    const savedKanbanScroll = kanbanEl ? kanbanEl.scrollTop : 0;
    const savedSidebarScroll = sidebarScrollEl ? sidebarScrollEl.scrollTop : 0;

    const savedCardScrolls = new Map<string, number>();
    root?.querySelectorAll(".dashboard-section-cards").forEach((el) => {
      const section = (el as HTMLElement).closest(".dashboard-section-row");
      const key = section?.getAttribute("data-column") ?? "";
      if (key) savedCardScrolls.set(key, (el as HTMLElement).scrollLeft);
    });

    // Save per-task-list scroll positions so they survive re-render
    const savedTaskListScrolls = new Map<string, number>();
    root?.querySelectorAll(".dashboard-task-list").forEach((el) => {
      const cardId = (el as HTMLElement).dataset.cardId;
      if (cardId)
        savedTaskListScrolls.set(cardId, (el as HTMLElement).scrollTop);
    });

    const container = this.containerEl.children[1] as HTMLElement;
    // Layer 3 — drop all file-suggest dropdowns on document.body BEFORE
    // the dashboard re-renders. The .empty() below only removes nodes
    // inside the dashboard container; dropdowns live on document.body
    // and would otherwise leak across re-renders.
    closeAllFileSuggests();
    container.empty();
    container.addClass("peingxious-dashboard-root");

    const bannerHandle = renderBanner(
      container,
      activeData.banner,
      () => this.openBannerEditModal(activeData),
      this.app,
      this.embeddedNotePath ?? "default",
    );
    const bannerEl = bannerHandle.bannerEl;
    this.bannerHandles.push(bannerHandle);

    this.renderMobileActions(bannerEl);

    // Banner manages its own collapsed state (see banner.ts). We do
    // not force-add `dashboard-banner--collapsed` here because that
    // would race with the user's own click on the pin button —
    // every re-render would silently re-collapse a banner the user
    // just expanded. Banner reads/writes its own localStorage key.
    this.setupBannerBehavior(bannerEl);

    this.renderMobileWidgetBar(container);

    // Navigation bar: toggle between main dashboard and note dashboard
    this.renderViewNavBar(container);

    const mainLayout = container.createDiv({ cls: "dashboard-main" });

    const sidebar = mainLayout.createDiv({ cls: "dashboard-sidebar" });
    if (this.sidebarPinned) {
      sidebar.addClass("dashboard-sidebar--pinned");
    } else if (this.sidebarExpanded) {
      sidebar.addClass("dashboard-sidebar--expanded");
    } else {
      sidebar.addClass("dashboard-sidebar--collapsed");
    }
    this.renderSidebar(sidebar, container);
    this.setupSidebarBehavior(sidebar, container);

    const kanban = mainLayout.createDiv({ cls: "dashboard-kanban-wrapper" });
    const renderCallbacks = this.embeddedNotePath
      ? this.createEmbeddedCallbacks()
      : this.createCallbacks();
    // v1.4.x R5 — pick the right "host file" for the dashboard so
    // wikilink hover preview resolves against this file (not
    // against whatever markdown the user has open in the main
    // pane). Main view: the dashboard's own file. Embedded view:
    // the embedded note (which stores the per-note columns).
    const hostSourcePath = this.embeddedNotePath
      ? this.embeddedNotePath
      : this.sync.getFile()?.path;
    renderDashboard(
      kanban,
      activeData,
      renderCallbacks,
      this.app,
      this.plugin.settings,
      hostSourcePath,
    );
    setupDragAndDrop(kanban, renderCallbacks, this.cleanupFns);
    // Library config event delegation
    kanban.addEventListener("dashboard-library-config", ((e: CustomEvent) => {
      const { columnName } = e.detail as { columnName: string };
      this.openLibraryConfigModal(columnName);
    }) as EventListener);

    // Restore scroll positions
    const newKanban = container.querySelector(".dashboard-kanban");
    const newSidebarScroll = container.querySelector(
      ".dashboard-sidebar-scroll",
    );
    if (newKanban) newKanban.scrollTop = savedKanbanScroll;
    if (newSidebarScroll) newSidebarScroll.scrollTop = savedSidebarScroll;

    container.querySelectorAll(".dashboard-section-cards").forEach((el) => {
      const section = (el as HTMLElement).closest(".dashboard-section-row");
      const key = section?.getAttribute("data-column") ?? "";
      const saved = savedCardScrolls.get(key);
      if (saved !== undefined) (el as HTMLElement).scrollLeft = saved;
    });

    // Restore per-task-list scroll positions
    container.querySelectorAll(".dashboard-task-list").forEach((el) => {
      const cardId = (el as HTMLElement).dataset.cardId;
      const saved = cardId ? savedTaskListScrolls.get(cardId) : undefined;
      if (saved !== undefined) (el as HTMLElement).scrollTop = saved;
    });

    // Scroll to newly added card
    if (this.pendingScrollCardId) {
      const cardEl = container.querySelector(
        `[data-card-id="${this.pendingScrollCardId}"]`,
      );
      if (cardEl) {
        requestAnimationFrame(() => {
          cardEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });
        });
      }
      this.pendingScrollCardId = null;
    }
    if (this.pendingScrollToLastCardOfColumn) {
      const colName = this.pendingScrollToLastCardOfColumn;
      const sectionRow = container.querySelector(`[data-column="${colName}"]`);
      if (sectionRow) {
        const cards = sectionRow.querySelectorAll(".dashboard-card");
        const lastCard = cards[cards.length - 1];
        if (lastCard) {
          requestAnimationFrame(() => {
            lastCard.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "center",
            });
          });
        }
      }
      this.pendingScrollToLastCardOfColumn = null;
    }
  }

  private renderMobileActions(bannerEl: HTMLElement): void {
    const actions = bannerEl.createDiv({ cls: "dashboard-mobile-actions" });

    const linksBtn = actions.createEl("button", {
      cls: "dashboard-mobile-action-btn",
      attr: {},
    });
    setIcon(linksBtn, "zap");
    linksBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openMobileDrawer("quickActions");
    });

    const recentBtn = actions.createEl("button", {
      cls: "dashboard-mobile-action-btn",
      attr: {},
    });
    setIcon(recentBtn, "clock");
    recentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openMobileDrawer("recent");
    });

    // On mobile, tapping right half of banner reveals the edit button
    const overlay = bannerEl.querySelector(
      ".dashboard-banner-overlay",
    ) as HTMLElement;
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        const rect = overlay.getBoundingClientRect();
        const tapX = (e as MouseEvent).clientX - rect.left;
        if (tapX > rect.width * 0.5) {
          const editBtn = overlay.querySelector(
            ".dashboard-banner-edit-btn",
          ) as HTMLElement;
          if (editBtn) {
            editBtn.addClass("dashboard-banner-edit-btn--mobile-visible");
          }
        }
      });
    }
  }

  private renderViewNavBar(container: HTMLElement): void {
    // Bump generation BEFORE we create any buttons. Every timer
    // captured in this render captures THIS number. If the bar
    // gets re-rendered (via embedNoteDashboard or any other
    // trigger) before the timer fires, the timer's captured gen
    // will no longer match the class's current gen and the timer
    // will safely no-op.
    const navGen = ++this.navBarGeneration;

    const navBar = container.createDiv({ cls: "dashboard-view-nav-bar" });

    // Left group: tabs
    const leftGroup = navBar.createDiv({ cls: "dashboard-view-nav-left" });

    // Shared handlers for dblclick + right-click, factored out so
    // both the main tab AND the note tabs can use them. The main
    // tab has no underlying md file, so `notePath` is null and
    // openAsMarkdown() / closeNoteTab() gracefully no-op with a
    // Notice — but the UI affordance (dblclick + right-click) is
    // identical, matching the note tabs.
    /** Try to open the given md by replacing the active md leaf. */
    const openAsMarkdown = async (notePath: string | null): Promise<void> => {
      // Main tab case: there is no embedded note path of course,
      // but the workspace IS backed by the dashboard file from
      // settings. Resolve that file via the sync engine (which
      // already created/loaded it during init) and open it in
      // place of the active md leaf, so the user can edit the
      // raw dashboard markdown. Only fall back to the
      // "no underlying note" Notice if the sync engine truly
      // has no file (init failure, etc.).
      let resolvedPath = notePath;
      if (!resolvedPath) {
        const mainFile = this.sync.getFile();
        if (mainFile) resolvedPath = mainFile.path;
      }
      if (!resolvedPath) {
        new Notice(
          t("noteDash.mainTabNoMd") ||
            "The main dashboard has no underlying note to open.",
        );
        return;
      }
      try {
        const file = this.app.vault.getAbstractFileByPath(resolvedPath);
        if (!(file instanceof TFile)) {
          new Notice(t("noteDash.fileNotFound"));
          return;
        }

        const mdLeaves = this.app.workspace.getLeavesOfType("markdown");
        const activeFile = this.app.workspace.getActiveFile();
        const targetLeaf =
          mdLeaves.find((l) => {
            const viewFile = (l.view as { file?: TFile | null }).file;
            return viewFile?.path === activeFile?.path;
          }) ??
          mdLeaves[0] ??
          null;

        if (!targetLeaf) {
          new Notice(
            t("noteDash.noActiveMd") ||
              "No markdown window is open to replace. Open a note first, then double-click the tab.",
          );
          return;
        }

        await targetLeaf.openFile(file, { active: true });
      } catch {}
    };

    /** Close a note tab; for the main tab this is a no-op. */
    const closeNoteTab = async (notePath: string | null): Promise<void> => {
      if (!notePath) {
        new Notice(
          t("noteDash.mainTabCannotClose") ||
            "The main dashboard tab cannot be closed.",
        );
        return;
      }
      await this.closeNoteTab(notePath);
    };

    /** Build a contextmenu handler for a tab (main or note). */
    const buildContextMenu = (notePath: string | null) => {
      return (e: MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem((item) =>
          item
            .setTitle(t("noteDash.menuOpen") || "Open note")
            .setIcon("file-text")
            .onClick(() => {
              if (notePath) activateNoteTab(notePath);
              void openAsMarkdown(notePath);
            }),
        );
        menu.addSeparator();
        menu.addItem((item) =>
          item
            .setTitle(t("noteDash.menuClose") || "Close tab")
            .setIcon("x")
            .onClick(() => {
              void closeNoteTab(notePath);
            }),
        );
        menu.showAtPosition({ x: e.clientX, y: e.clientY });
      };
    };

    // ---- Main Dashboard tab (home) ----
    const mainTab = leftGroup.createEl("button", {
      cls:
        "dashboard-view-nav-tab" +
        (!this.embeddedNotePath ? " dashboard-view-nav-tab--active" : ""),
      text: t("main.dashboard"),
    });
    {
      const icon = mainTab.createSpan({ cls: "dashboard-view-nav-tab-icon" });
      setIcon(icon, "home");
      mainTab.insertBefore(icon, mainTab.firstChild);
    }
    {
      // Main tab: same dblclick + right-click affordance as note
      // tabs. Pass null as notePath so openAsMarkdown / closeNoteTab
      // gracefully no-op with a Notice.
      const mainNavGen = this.navBarGeneration;
      let clickTimer: ReturnType<typeof setTimeout> | null = null;
      let lastClickTime = 0;
      const onClick = (): void => {
        const now = Date.now();
        const isDouble = now - lastClickTime < NAV_DBLCLICK_THRESHOLD_MS;
        lastClickTime = now;
        if (clickTimer !== null) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }
        if (isDouble) {
          void openAsMarkdown(null);
          return;
        }
        if (!this.embeddedNotePath) {
          // Already on main; nothing to do.
          return;
        }
        clickTimer = setTimeout(() => {
          if (this.navBarGeneration !== mainNavGen) {
            clickTimer = null;
            return;
          }
          clickTimer = null;
          this.exitEmbeddedMode();
        }, NAV_DBLCLICK_THRESHOLD_MS);
      };
      mainTab.addEventListener("click", onClick);
      const onContextMenu = buildContextMenu(null);
      mainTab.addEventListener("contextmenu", onContextMenu);
    }

    // Store references to all tab elements so we can update the
    // active-highlight class on the fly — important for the
    // double-click and right-click "Open" actions, which open the
    // md in a horizontal-split pane WITHOUT re-rendering the
    // dashboard view. Without this live update, the tab that was
    // just opened would not show as highlighted.
    const mainTabEl = mainTab;
    const noteTabEls = new Map<string, HTMLElement>();

    // Refresh which tab carries the active-highlight class.
    // `activePath === null` => main dashboard tab is active.
    // `activePath`       => the matching note tab is active.
    const refreshActiveHighlight = (activePath: string | null): void => {
      if (activePath === null) {
        mainTabEl.addClass("dashboard-view-nav-tab--active");
      } else {
        mainTabEl.removeClass("dashboard-view-nav-tab--active");
      }
      for (const [path, el] of noteTabEls) {
        if (path === activePath) {
          el.addClass("dashboard-view-nav-tab--active");
        } else {
          el.removeClass("dashboard-view-nav-tab--active");
        }
      }
    };

    // Mark a note tab as the currently active embedded note AND
    // refresh the navbar highlight. Persists across reloads via
    // `activeEmbeddedNoteTab` in settings.
    const activateNoteTab = (path: string): void => {
      this.embeddedNotePath = path;
      refreshActiveHighlight(path);
    };

    // Embedded note tabs from settings
    const tabPaths = this.plugin.settings.embeddedNoteTabs ?? [];
    for (const notePath of tabPaths) {
      const noteName = notePath.split("/").pop() ?? notePath;
      const isActive = this.embeddedNotePath === notePath;

      const tabEl = leftGroup.createDiv({
        cls: "dashboard-view-nav-tab-wrap",
        attr: {},
      });

      const btn = tabEl.createEl("button", {
        cls:
          "dashboard-view-nav-tab" +
          (isActive ? " dashboard-view-nav-tab--active" : ""),
        text: noteName,
      });
      // Track the button (not the wrap) so the active class lands on
      // the element that .dashboard-view-nav-tab--active CSS targets.
      noteTabEls.set(notePath, btn);
      {
        const icon = btn.createSpan({ cls: "dashboard-view-nav-tab-icon" });
        setIcon(icon, "file-code");
        btn.insertBefore(icon, btn.firstChild);
      }
      // Single vs double click detection. The single-click action
      // (embedNoteDashboard) re-renders the whole view and destroys
      // this button, so the browser's native `dblclick` event can
      // never fire — the second click lands on a brand-new button.
      // We therefore delay the single-click action by 250ms and
      // cancel it if a second click comes in within that window.
      //
      // The shared `openAsMarkdown` / `buildContextMenu` (defined
      // above) are reused — note tabs pass `notePath`, the main
      // tab passes `null`.
      let clickTimer: ReturnType<typeof setTimeout> | null = null;
      let lastClickTime = 0;

      btn.addEventListener("click", () => {
        const now = Date.now();
        const isDouble = now - lastClickTime < NAV_DBLCLICK_THRESHOLD_MS;
        lastClickTime = now;

        if (clickTimer !== null) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }

        if (isDouble) {
          // Second click within threshold -> treat as dblclick.
          // Mark this tab as active so it shows highlighted, then
          // open the md in-place in the active md leaf.
          activateNoteTab(notePath);
          void openAsMarkdown(notePath);
          return;
        }

        if (isActive) {
          // Already showing this note's dashboard; nothing to do.
          return;
        }

        // Defer the embed call so a possible follow-up click can
        // cancel it and be interpreted as a dblclick.
        clickTimer = setTimeout(() => {
          // Stale-timer guard: if the navbar was re-rendered
          // between when this timer was armed and now, the
          // button this timer was attached to is gone. A
          // re-render here would replace whatever button the
          // user is currently mid-interaction with (e.g.
          // their second click of a dblclick), silently
          // breaking the dblclick / right-click that follows.
          // We simply no-op.
          if (this.navBarGeneration !== navGen) {
            clickTimer = null;
            return;
          }
          clickTimer = null;
          void this.embedNoteDashboard(notePath);
        }, NAV_DBLCLICK_THRESHOLD_MS);
      });

      // Native contextmenu: same as dblclick — activate tab +
      // open md in-place — plus a "Close tab" item.
      const onContextMenu = buildContextMenu(notePath);
      tabEl.addEventListener("contextmenu", onContextMenu);
      btn.addEventListener("contextmenu", onContextMenu);
    }

    // Divider
    navBar.createDiv({ cls: "dashboard-view-nav-divider" });

    // Right group: action buttons
    const rightGroup = navBar.createDiv({ cls: "dashboard-view-nav-right" });

    // "+ Open" button: pick a file with columns frontmatter
    const openBtn = rightGroup.createEl("button", {
      cls: "dashboard-view-nav-btn",
      text: t("noteDash.openDash"),
    });
    {
      const icon = openBtn.createSpan({ cls: "dashboard-view-nav-btn-icon" });
      setIcon(icon, "plus");
      openBtn.insertBefore(icon, openBtn.firstChild);
    }
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showColumnFilePicker(navBar);
    });
  }

  /** Scan files for columns frontmatter and show picker */
  private async showColumnFilePicker(anchorEl: HTMLElement): Promise<void> {
    return showColumnFilePickerUI({
      app: this.app,
      plugin: this.plugin,
      anchorEl,
      rootEl: this.containerEl.children[1] as HTMLElement,
      embeddedNotePath: this.embeddedNotePath,
      cleanupFns: this.cleanupFns,
      embedNoteDashboard: (notePath) => this.embedNoteDashboard(notePath),
      t,
    });
  }

  /** Load a note's dashboard data and render it embedded in the main view */
  async embedNoteDashboard(notePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      new Notice(t("noteDash.fileNotFound"));
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      this.embeddedData = parse(content);
      this.embeddedNotePath = notePath;
      // Add to persisted tabs list if not already there
      const tabs = this.plugin.settings.embeddedNoteTabs ?? [];
      if (!tabs.includes(notePath)) {
        tabs.push(notePath);
        this.plugin.settings.embeddedNoteTabs = tabs;
        this.plugin.saveSettings();
      }
      // Update cache
      this.embeddedDataCache.set(notePath, this.embeddedData);

      // Re-render with embedded data
      const currentData = this.sync.getData();
      if (currentData) this.render(currentData);

      // Add peingxious-note-dashboard-root class for fixed-width card styles
      const root = this.containerEl.children[1] as HTMLElement;
      root?.addClass("peingxious-note-dashboard-root");
    } catch (err) {
      reportError(
        "[peingxious-dashboard]",
        "Error loading note dashboard",
        err,
        t("noteDash.loadError"),
      );
    }
  }

  /** Close a note tab from the navigation bar */
  async closeNoteTab(notePath: string): Promise<void> {
    const tabs = (this.plugin.settings.embeddedNoteTabs ?? []).filter(
      (p) => p !== notePath,
    );
    this.plugin.settings.embeddedNoteTabs = tabs;

    // If closing the active tab, switch to main dashboard
    if (this.plugin.settings.activeEmbeddedNoteTab === notePath) {
      this.plugin.settings.activeEmbeddedNoteTab = null;
      this.embeddedData = null;
      const root = this.containerEl.children[1] as HTMLElement;
      root?.removeClass("peingxious-note-dashboard-root");
    }

    await this.plugin.saveSettings();

    const currentData = this.sync.getData();
    if (currentData) this.render(currentData);
  }

  /** Re-enter embedded mode from cached data */
  private async reenterEmbeddedMode(notePath: string): Promise<void> {
    let data = this.embeddedDataCache.get(notePath);
    if (!data) {
      // Cache miss — reload from file
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) return;
      try {
        const content = await this.app.vault.read(file);
        data = parse(content);
        this.embeddedDataCache.set(notePath, data);
      } catch (err) {
        reportError(
          "[peingxious-dashboard]",
          "Error reloading note dashboard",
          err,
          t("noteDash.loadError"),
        );
        return;
      }
    }
    this.embeddedNotePath = notePath;
    this.embeddedData = data;

    const currentData = this.sync.getData();
    if (currentData) this.render(currentData);

    const root = this.containerEl.children[1] as HTMLElement;
    root?.addClass("peingxious-note-dashboard-root");
  }

  /** Exit embedded mode, return to main dashboard (keep tabs intact) */
  private exitEmbeddedMode(): void {
    if (!this.plugin.settings.activeEmbeddedNoteTab) return;
    this.plugin.settings.activeEmbeddedNoteTab = null;
    this.embeddedData = null;
    // Keep cache and tabs intact — do NOT clear them

    const root = this.containerEl.children[1] as HTMLElement;
    root?.removeClass("peingxious-note-dashboard-root");

    const currentData = this.sync.getData();
    if (currentData) this.render(currentData);

    // Persist the tab state change
    this.plugin.saveSettings();
  }

  /** Create callbacks for embedded note mode (save changes back to note) */
  private createEmbeddedCallbacks() {
    const self = this;
    return {
      onCardEdit: (card: DashboardCard) => {
        const modal = new CardEditModal(
          this.app,
          card,
          async (updates) => {
            // v1.4.10 — funnel the modal's save back through the
            // same `patchCardData` helper as the workbench. The
            // previous embedded version reached into the live
            // card via `Object.assign(c.card, updates)`, which
            // was the historical source of "I edited the title
            // in the modal but the embedded view still shows
            // the old title" — the modal held a stale card
            // reference, `findEmbeddedCard` then matched that
            // stale reference, and the in-place mutation was
            // either no-op'd (because the live object was a
            // different reference) or applied to a card the
            // next render would immediately replace. The
            // immutable helper returns a NEW data object whose
            // new column-tree the next render walks from
            // scratch, so the "stale reference" race is
            // closed.
            if (!self.embeddedData) return;
            self.embeddedData = SyncEngine.patchCardData(
              self.embeddedData,
              card.id,
              updates,
            );
            await self.saveEmbeddedAndRefresh();
          },
          this.plugin.settings.stylePreset,
        );
        modal.open();
      },
      onCardDelete: async (cardId: string) => {
        // Direct delete (project/memo style): no confirm dialog.
        // v1.4.10 — funnel through the unified `removeCardData`
        // helper so the embedded view's "delete" goes through
        // the same code path as the workbench (which also fixes
        // the long-standing "the deleted card is still in the
        // next render's card-list" race, since the helper
        // returns a NEW data object).
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.removeCardData(
          self.embeddedData,
          cardId,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onCheckboxToggle: async (
        cardId: string,
        taskIndex: number,
        checked: boolean,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — same `toggleTaskData` helper as the workbench,
        // which means the embedded view also gets the
        // "checked-sinks-to-the-bottom" UX rule for free. The
        // previous embedded version only flipped the `checked`
        // bit and left the task in place, so the two views
        // would visibly disagree on the order of the task list
        // after a check.
        self.embeddedData = SyncEngine.toggleTaskData(
          self.embeddedData,
          cardId,
          taskIndex,
          checked,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onTaskAdd: async (cardId: string, text: string) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `addTaskData` helper so
        // task add goes through the same immutable path and
        // the same "trim → drop empty" guard as the workbench.
        self.embeddedData = SyncEngine.addTaskData(
          self.embeddedData,
          cardId,
          text,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onTaskDelete: async (cardId: string, taskIndex: number) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.deleteTaskData(
          self.embeddedData,
          cardId,
          taskIndex,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onTaskReorder: async (cardId: string, from: number, to: number) => {
        if (!self.embeddedData) return;
        // v1.4.10 — same `reorderTaskData` helper as the workbench.
        self.embeddedData = SyncEngine.reorderTaskData(
          self.embeddedData,
          cardId,
          from,
          to,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onTaskMoveToCard: async (
        srcCardId: string,
        taskIndex: number,
        destCardId: string,
        destIndex: number,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — same `moveTaskToCardData` helper as the
        // workbench, including the source-then-dest lockstep
        // and the destIndex clamp.
        self.embeddedData = SyncEngine.moveTaskToCardData(
          self.embeddedData,
          srcCardId,
          taskIndex,
          destCardId,
          destIndex,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onTaskEdit: async (
        cardId: string,
        taskIndex: number,
        newText: string,
      ) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.editTaskData(
          self.embeddedData,
          cardId,
          taskIndex,
          newText,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onCardAdd: async (columnName: string, options?: { title?: string }) => {
        if (!self.embeddedData) return;
        const col = self.embeddedData.columns.find(
          (c) => c.name === columnName,
        );
        if (!col) return;
        const effectiveType = col.sectionType ?? col.name.toLowerCase();

        if (effectiveType === "memo" || effectiveType === "todo") {
          // v1.4.10 — same `addCardData` helper as the workbench
          // / sidebar. The previous embedded version re-built
          // the structural baseline (id / type / progress / size
          // / grid / …) inline, which could drift on field
          // additions (e.g. if the baseline gained a new key the
          // embedded view would silently keep using the old
          // set). The helper owns the baseline; the sectionType-
          // specific `title` / `type` / `tasks` overrides are
          // layered on top.
          self.embeddedData = SyncEngine.addCardData(
            self.embeddedData,
            columnName,
            {
              id: `${Date.now()}-new`,
              title:
                effectiveType === "memo"
                  ? t("default.memoTitle", { date: "" })
                  : t("default.todoTitle1"),
              type: effectiveType === "memo" ? "generic" : "task",
              tasks:
                effectiveType === "todo" ? [{ text: "", checked: false }] : [],
            },
          );
          await self.saveEmbeddedAndRefresh();
        } else if (effectiveType === "todoplus") {
          // TodoPlus section: don't open the project-search modal —
          // we know the user wants a *mirror* card (a card whose body
          // is rendered from another note's `## heading` block), so
          // we push a pre-typed `type: "todoplus"` placeholder
          // immediately.
          //
          // On-disk identity comes from two things that are already
          // in the markdown — we don't write any per-card
          // `type:` or `sourceLink:` metadata line:
          //   1. The column's `sectionType: todoplus` (frontmatter,
          //      single source of truth for the column kind).
          //   2. The card's first-bullet title, which is a wikilink
          //      of the form `[[note#heading]]` and is the
          //      source-link pointer. The renderer parses the title
          //      directly via `getTodoPlusSourceLinkFromTitle`.
          //
          // The caller (renderer.ts `openTodoPlusNoteSearchModal` →
          // `addTodoPlusCardFromNote`) passes the wikilink-form
          // title `[[note#To-do]]` through `options.title`. If no
          // title was supplied, the placeholder is created empty
          // and the card UI shows the "Set source" button
          // (handled in `renderTodoPlusBody` /
          // `promptTodoPlusSourceLink`).
          //
          // When a wikilink-form `options.title` is supplied we
          // also auto-append the corresponding `## heading` block
          // to the source note (idempotent — `ensureTodoPlusHeading`
          // is a no-op when the heading is already there) so the
          // mirror card has a real checklist to render on the
          // very first refresh. The non-embedded flow gets this
          // for free via `addTodoPlusCardFromNote`; embedded mode
          // does *not* go through that helper, so we do it here.
          const initialTitle = options?.title?.trim() ?? "";
          const sourceFile = initialTitle
            ? resolveTodoPlusSourceFile(
                self.app,
                initialTitle,
                self.embeddedNotePath ?? undefined,
              )
            : null;
          if (sourceFile) {
            await ensureTodoPlusHeading(self.app, sourceFile, "To-do");
          }
          // v1.4.10 — same `addCardData` helper as the
          // workbench / sidebar. The sectionType-specific
          // `title` / `type: "todoplus"` override is layered
          // on top via the `overrides` argument.
          self.embeddedData = SyncEngine.addCardData(
            self.embeddedData,
            columnName,
            {
              id: `${Date.now()}-todoplus`,
              title: initialTitle,
              type: "todoplus",
            },
          );
          await self.saveEmbeddedAndRefresh();
        } else {
          self.openEmbeddedProjectSearch(columnName);
        }
      },
      onColumnAdd: async (name: string, sectionType?: string) => {
        if (!self.embeddedData) return;
        // v1.4.10 — funnel through the same `addColumnData` helper
        // the workbench uses, so the default color / sectionType
        // fallback ("project") is defined in one place.
        self.embeddedData = SyncEngine.addColumnData(
          self.embeddedData,
          name,
          sectionType || "project",
        );
        await self.saveEmbeddedAndRefresh();
      },
      onBannerEdit: () => self.openEmbeddedBannerEditModal(),
      onQuickActionAdd: () => self.openEmbeddedAddActionModal(),
      onQuickActionRemove: async (index: number) => {
        const confirmed = await showConfirmDialog(this.app, {
          title: t("common.confirmDelete"),
          message: t("common.confirmDeleteMessage"),
        });
        if (confirmed && self.embeddedData) {
          self.embeddedData.quickActions.splice(index, 1);
          await self.saveEmbeddedAndRefresh();
        }
      },
      onMoveCard: async (
        cardId: string,
        targetColumn: string,
        targetIndex: number,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the same `moveCardData` helper as the
        // workbench. The helper also fixes the `card.column` field
        // on the moved card, which the previous embedded version
        // forgot to do — that was the root cause of the "moved
        // card keeps the old column name in its metadata" bug.
        self.embeddedData = SyncEngine.moveCardData(
          self.embeddedData,
          cardId,
          targetColumn,
          targetIndex,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onMemoUpdate: async (
        card: DashboardCard,
        updates: { body: string; blockquote: string },
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `patchCardData` helper so
        // memo body / blockquote updates go through the same
        // immutable path as the workbench.
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          card.id,
          updates,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectDocsUpdate: async (card: DashboardCard, docPaths: string[]) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `updateProjectDocsData` helper
        // so the docPaths → projectDocs + body conversion runs
        // through the same code path as the workbench.
        self.embeddedData = SyncEngine.updateProjectDocsData(
          self.embeddedData,
          card.id,
          docPaths,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectDocsReorder: async (
        cardId: string,
        from: number,
        to: number,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `reorderDocPathsData` helper
        // and re-derive the body from the new docPaths list, so
        // projectDocs AND body stay in lockstep. The previous
        // embedded version updated projectDocs manually but
        // forgot to re-write `body` in the same call frame,
        // which occasionally caused a re-render to show stale
        // lines.
        const after = SyncEngine.reorderDocPathsData(
          self.embeddedData,
          cardId,
          from,
          to,
        );
        if (after === self.embeddedData) return;
        self.embeddedData = after;
        await self.saveEmbeddedAndRefresh();
      },
      onDocMoveToCard: async (
        srcCardId: string,
        docIndex: number,
        destCardId: string,
        destIndex: number,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — same `moveDocToCardData` helper as the
        // workbench, with body re-derived for both source and
        // destination cards.
        const after = SyncEngine.moveDocToCardData(
          self.embeddedData,
          srcCardId,
          docIndex,
          destCardId,
          destIndex,
        );
        if (after === self.embeddedData) return;
        self.embeddedData = after;
        await self.saveEmbeddedAndRefresh();
      },
      // Unified add-doc path: the workbench view and the embedded
      // view now share the exact same data-mutation helper
      // (`SyncEngine.addDocToCardData`). Previously the embedded
      // view re-implemented this logic inline AND mutated the card
      // object in-place — which is a recipe for the "添加到第三
      // 卡片会跑到第一卡片" bug when the embedded data is reloaded
      // from disk between render and input: the render captured a
      // stale card reference, `findEmbeddedCard` then matched that
      // stale ID against the freshly-loaded (different object) and
      // appended to the wrong card after a reload raced with the
      // input. Going through the pure helper (which returns a NEW
      // data object) closes that race.
      onProjectDocsAdd: async (card: DashboardCard, docPath: string) => {
        if (!self.embeddedData) return;
        const cardId = card.id;
        if (!cardId) return;
        // Defensive: if the captured card ID is no longer in the
        // current embeddedData, the data was reloaded after the
        // render captured the closure. This used to silently
        // append to the first card with a matching ID (the bug
        // the user reported). Refuse to write — the next render
        // will re-capture a fresh closure from the current data.
        const allCardIds = self.embeddedData.columns.flatMap((c) =>
          c.cards.map((cd) => cd.id),
        );
        if (!allCardIds.includes(cardId)) {
          console.warn(
            "[apex-dashboard] onProjectDocsAdd: stale cardId",
            cardId,
            "; available ids:",
            allCardIds,
          );
          return;
        }
        self.embeddedData = SyncEngine.addDocToCardData(
          self.embeddedData,
          cardId,
          docPath,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectDocsRemove: async (card: DashboardCard, topIndex: number) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `removeProjectDocData` helper
        // and re-derive the body from the trimmed projectDocs
        // list, so projectDocs AND body stay in lockstep.
        const after = SyncEngine.removeProjectDocData(
          self.embeddedData,
          card.id,
          topIndex,
        );
        if (after === self.embeddedData) return;
        self.embeddedData = after;
        await self.saveEmbeddedAndRefresh();
      },
      onMemoColorChange: async (card: DashboardCard, color: string) => {
        if (!self.embeddedData) return;
        // v1.4.10 — `patchCardData` keeps memo color updates on
        // the same immutable path as every other card field.
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          card.id,
          { color },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectCoverChange: async (card: DashboardCard, imagePath: string) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          card.id,
          { coverImage: imagePath },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onMemoConvertToNote: async (card: DashboardCard) => {
        // Same implementation as the main-dashboard variant — the
        // embedded view still uses the same Obsidian app / vault.
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
          if (self.embeddedData) {
            // v1.4.10 — funnel through `patchCardData` so memo
            // conversion goes through the same immutable path
            // as the workbench.
            self.embeddedData = SyncEngine.patchCardData(
              self.embeddedData,
              card.id,
              {
                body: buildMemoLinkedBody(targetPath),
                blockquote: "",
              },
            );
            await self.saveEmbeddedAndRefresh();
          }
          new Notice(t("memo.converted", { path: targetPath }));
        } catch (e) {
          new Notice(t("memo.convertError", { message: (e as Error).message }));
        }
      },
      onCardTitleEdit: async (cardId: string, newTitle: string) => {
        if (!self.embeddedData) return;
        // v1.4.10 — `patchCardData` keeps card title updates on
        // the same immutable path as every other card field.
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          cardId,
          { title: newTitle },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onCardWidthChange: async (cardId: string, width: number) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          cardId,
          { width },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onCardSizeChange: async (cardId: string, size: string) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          cardId,
          { size: size as import("./types").CardSize },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onTaskHideCompletedChange: async (cardId: string, hide: boolean) => {
        if (!self.embeddedData) return;
        // v1.4.10 — same `patchCardData` path as the workbench
        // `updateCardHideCompleted`, minus the session-only
        // `hideCompletedOverrides` map (the embedded view has
        // no separate override layer — the data lives in
        // `self.embeddedData` and the next render picks it up).
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          cardId,
          { hideCompleted: hide },
        );
        const currentData = self.sync.getData();
        if (currentData) self.render(currentData);
      },
      onCardGridChange: async (
        cardId: string,
        gridCols: number,
        gridRows: number,
      ) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          cardId,
          { gridCols, gridRows },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onCardGridMove: async (
        cardId: string,
        gridCol: number,
        gridRow: number,
      ) => {
        if (!self.embeddedData) return;
        self.embeddedData = SyncEngine.patchCardData(
          self.embeddedData,
          cardId,
          { gridCol, gridRow },
        );
        await self.saveEmbeddedAndRefresh();
      },
      onFileDrop: async (cardId: string, filePath: string) => {
        if (!self.embeddedData) return;
        const found = self.findEmbeddedCard(cardId);
        if (!found) return;
        const col = self.embeddedData.columns.find(
          (c) => c.name === found.card.column,
        );
        const sectionType = col?.sectionType ?? col?.name.toLowerCase() ?? "";
        const cardType = found.card.type;
        // v1.4.10 — funnel file-drop through the same
        // `addFileLinkData` helper as the workbench, so the
        // three-way wrap rule, the projectDocs+body lockstep,
        // and the "weather / tracker silently drop" guard all
        // live in one place. The previous embedded version
        // re-implemented this entire block inline — see the
        // long comment above for the bug it was working around.
        const after = SyncEngine.addFileLinkData(
          self.embeddedData,
          cardId,
          filePath,
          sectionType,
          cardType,
        );
        if (after === self.embeddedData) return;
        self.embeddedData = after;
        await self.saveEmbeddedAndRefresh();
      },
      onProjectItemReorder: async (
        cardId: string,
        fromIndex: number,
        toIndex: number,
      ) => {
        if (!self.embeddedData) return;
        // Unified path: same helper as the workbench, so the
        // embedded view and the workbench can no longer drift
        // on edge cases like "insert at the end" or the
        // body/projectDocs lockstep. The previous embedded
        // implementation re-implemented this inline using
        // `projectDocs` indices + a `synthesizeProjectBodyFromDocs`
        // call, which is the historical source of the
        // "拖拽第三个直接消失了" regression (a stale projectDocs
        // length or an off-by-one in the body synthesis could
        // drop the last item on every reorder).
        self.embeddedData = SyncEngine.reorderProjectItemData(
          self.embeddedData,
          cardId,
          fromIndex,
          toIndex,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectItemMoveToCard: async (
        srcCardId: string,
        itemIndex: number,
        destCardId: string,
        destIndex: number,
      ) => {
        if (!self.embeddedData) return;
        // Same unified helper as the workbench — see the
        // rationale in onProjectItemReorder above.
        self.embeddedData = SyncEngine.moveProjectItemToCardData(
          self.embeddedData,
          srcCardId,
          itemIndex,
          destCardId,
          destIndex,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectItemDelete: async (
        cardId: string,
        itemIndex: number,
        itemPath?: string,
      ) => {
        if (!self.embeddedData) return;
        // Unified path: same helper as the workbench, so the
        // embedded view and the workbench can no longer drift
        // on body / projectDocs sync. The embedded view used
        // to re-implement delete inline with its own bounds
        // check and a manual synthesizeProjectBodyFromDocs call
        // — that path is the historical source of the
        // "拖拽第三个直接消失了" / "删了最后一个又出现" symptoms
        // (a stale body or a missing projectDoc mirror meant
        // the renderer would fall back to a different source of
        // truth and the item would vanish or resurrect on the
        // next render).
        self.embeddedData = SyncEngine.removeProjectItemData(
          self.embeddedData,
          cardId,
          itemIndex,
          itemPath,
        ).data;
        await self.saveEmbeddedAndRefresh();
      },
      onColumnRename: async (oldName: string, newName: string) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `renameColumnData` helper
        // so rename also re-points the matching `card.column`
        // field on every card in the column (the previous
        // embedded version updated the column's display name
        // but not the `card.column` mirror, which broke
        // moveCardData's `col.name !== targetColumn` check).
        self.embeddedData = SyncEngine.renameColumnData(
          self.embeddedData,
          oldName,
          newName,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onColumnDelete: async (columnName: string) => {
        // Protect first column and columns with tags/links
        if (self.embeddedData) {
          const idx = self.embeddedData.columns.findIndex(
            (c) => c.name === columnName,
          );
          if (
            idx === 0 ||
            columnName.includes("[[") ||
            columnName.includes("#")
          ) {
            new Notice(t("error.cannotDeleteMainColumn"));
            return;
          }
        }
        const confirmed = await showConfirmDialog(this.app, {
          title: t("common.confirmDelete"),
          message: t("renderer.deleteSectionConfirm", { column: columnName }),
        });
        if (confirmed && self.embeddedData) {
          // v1.4.10 — same `deleteColumnData` helper as the
          // workbench. The previous embedded version spliced
          // the column in place but kept orphaned `card.column`
          // references around — the renderer could then render
          // a card with no column, leaving a "ghost" item.
          self.embeddedData = SyncEngine.deleteColumnData(
            self.embeddedData,
            columnName,
          );
          await self.saveEmbeddedAndRefresh();
        }
      },
      onColumnSectionTypeChange: async (
        columnName: string,
        sectionType: string,
      ) => {
        // v1.4.10 — funnel through the unified
        // `setColumnSectionTypeData` helper. This guarantees
        // the embedded view and the workbench run the exact
        // same migration logic (`migrateCardsForSectionType`
        // is invoked inside the helper), so a sectionType
        // change on the embedded view can no longer leave
        // cards in a shape the serializer would refuse to
        // round-trip.
        if (!self.embeddedData) return;
        const after = SyncEngine.setColumnSectionTypeData(
          self.embeddedData,
          columnName,
          sectionType,
        );
        if (after === self.embeddedData) return;
        self.embeddedData = after;
        // Force an immediate re-render with the new data, then
        // persist to disk in the background. `saveEmbeddedAndRefresh`
        // is still awaited for its own side-effects (cache update,
        // embeddedDataCache write) but the view is already showing
        // the new state by then.
        const currentData = self.sync.getData();
        if (currentData) self.render(currentData);
        await self.saveEmbeddedAndRefresh();
      },
      onColumnArchiveCompletedChange: async (
        columnName: string,
        archive: boolean,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified
        // `setColumnArchiveCompletedData` helper so the
        // embedded view and the workbench write the same
        // `archiveCompleted` field through the same
        // immutable path.
        const after = SyncEngine.setColumnArchiveCompletedData(
          self.embeddedData,
          columnName,
          archive,
        );
        if (after === self.embeddedData) return;
        self.embeddedData = after;
        await self.saveEmbeddedAndRefresh();
      },
      onTaskReminderEdit: async (
        cardId: string,
        taskIndex: number,
        reminder: string | undefined,
      ) => {
        if (!self.embeddedData) return;
        // v1.4.10 — use the unified `editTaskReminderData`
        // helper. The previous embedded version only patched
        // `task.reminder` and skipped the "empty string
        // → undefined" normalisation the workbench does, so
        // the two views would write the task's reminder in
        // slightly different shapes after the user cleared
        // a reminder on one of them.
        self.embeddedData = SyncEngine.editTaskReminderData(
          self.embeddedData,
          cardId,
          taskIndex,
          reminder,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onProjectGroupAdd: async (columnName: string, title: string) => {
        if (!self.embeddedData) return;
        // v1.4.10 — funnel through the unified
        // `addProjectGroupData` helper. The helper owns the
        // canonical "empty project card" shape, so the
        // embedded view can no longer drift on e.g. whether
        // `projectDocs: []` is initialised (the renderer
        // will silently drop a card with `projectDocs:
        // undefined` to the markdown fallback path).
        self.embeddedData = SyncEngine.addProjectGroupData(
          self.embeddedData,
          columnName,
          title,
        );
        await self.saveEmbeddedAndRefresh();
      },
      onAddFromTemplate: (columnName: string) =>
        self.openEmbeddedTemplatePicker(columnName),
      onLibraryConfigChange: (columnName: string) =>
        self.openEmbeddedLibraryConfigModal(columnName),
    };
  }

  // --- Embedded mode helpers ---

  private findEmbeddedCard(
    cardId: string,
  ): { col: import("./types").DashboardColumn; card: DashboardCard } | null {
    if (!this.embeddedData) return null;
    for (const col of this.embeddedData.columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) return { col, card };
    }
    return null;
  }

  /**
   * Build a markdown body string from a list of projectDocs nodes.
   * Mirrors the inverse of parser.ts#parseProjectDocs so that drag
   * mutations written through this path produce the same markdown
   * shape that the next parse() call will read back. Used to keep
   * `card.body` and `card.projectDocs` in lockstep — see
   * onProjectItemReorder / onProjectItemMoveToCard.
   *
   * Format:
   *   - [[path|or-prefixed text]]           (top-level)
   *   \t- [[child]]                          (each child, one tab indent)
   */
  private synthesizeProjectBodyFromDocs(
    projectDocs: import("./types").ProjectDocNode[],
  ): string {
    // Fast path: a non-array (or empty) input is most often the
    // result of a project that has been cleared. Returning an
    // empty body means serialize() will also skip the body
    // branch, which is the correct canonical state.
    if (!Array.isArray(projectDocs) || projectDocs.length === 0) return "";
    const lines: string[] = [];
    const renderDoc = (doc: unknown, depth: number): void => {
      // Defensive: previous versions of this method assumed every
      // entry was a well-formed ProjectDocNode, but the data model
      // has been mutated by several code paths (drag reorder,
      // delete, deserialize from file, etc.) and at least one of
      // those paths can produce `undefined` entries or entries
      // whose `path` is missing/empty. Treat the whole shape as
      // untrusted and skip anything that isn't a real object with
      // a string `path`. Losing one body line is strictly better
      // than crashing the entire drop handler.
      if (!doc || typeof doc !== "object") return;
      const d = doc as { path?: unknown; children?: unknown };
      if (typeof d.path !== "string" || d.path.length === 0) return;
      const indent = "\t".repeat(depth);
      // Three-way wrap rule (mirrors onFileDrop / onProjectDocsAdd):
      //   1. d.path already contains "[[" → use verbatim.
      //   2. d.path looks like a vault path (has "/" or ends with
      //      ".md") → strip ".md" and wrap as `[[basename]]`.
      //   3. Anything else (plain text) → keep as-is. This is the
      //      key fix for "输入普通文本会变成双链笔记" — the user
      //      typed "11" and expects to see "- 11", not "- [[11]]".
      const path = d.path.includes("[[")
        ? d.path
        : d.path.includes("/") || d.path.toLowerCase().endsWith(".md")
          ? `[[${d.path.replace(/\.md$/, "")}]]`
          : d.path;
      lines.push(`${indent}- ${path}`);
      if (Array.isArray(d.children)) {
        for (const child of d.children) {
          renderDoc(child, depth + 1);
        }
      }
    };
    for (const doc of projectDocs) {
      // Filter out sparse holes from past splices / deletes so the
      // recursive renderer never sees an undefined doc.
      if (doc == null) continue;
      renderDoc(doc, 0);
    }
    return lines.join("\n");
  }

  private async saveEmbeddedAndRefresh(): Promise<void> {
    if (!this.embeddedData) {
      console.warn(
        "[apex-dashboard] saveEmbeddedAndRefresh called with no embeddedData, skipping save",
      );
      return;
    }
    if (!this.embeddedNotePath) {
      console.warn(
        "[apex-dashboard] saveEmbeddedAndRefresh called with no embeddedNotePath, skipping save",
      );
      return;
    }

    const { serializeInto } = await import("./parser");
    this.embeddedDataCache.set(this.embeddedNotePath, this.embeddedData);
    const file = this.app.vault.getAbstractFileByPath(this.embeddedNotePath);

    if (!(file instanceof TFile)) {
      console.error(
        "[apex-dashboard] Embedded file not found:",
        this.embeddedNotePath,
      );
      new Notice(
        t("noteDash.saveError") || "Failed to save: note file not found",
      );
      return;
    }

    try {
      const current = await this.app.vault.read(file);
      const newContent = serializeInto(current, this.embeddedData, this.app);

      this.isWritingEmbeddedFile = true;
      await this.app.vault.modify(file, newContent);

      setTimeout(() => {
        this.isWritingEmbeddedFile = false;
      }, 0);
    } catch (e) {
      this.isWritingEmbeddedFile = false;
      console.error(
        "[apex-dashboard] Failed to save embedded note:",
        this.embeddedNotePath,
        e,
      );
      new Notice(t("noteDash.saveError") || "Failed to save note changes");
      return;
    }

    const currentData = this.sync.getData();
    if (currentData) this.render(currentData);
  }

  private openEmbeddedBannerEditModal(): void {
    if (!this.embeddedData) return;
    const modal = new BannerEditModal(
      this.app,
      this.embeddedData.banner,
      async (updates) => {
        // Multi-attribute update fix: only copy the fields that the
        // caller actually provided a defined value for. Using
        // `Object.assign(target, updates)` blindly writes every key
        // from `updates` — including keys whose value is `undefined` —
        // onto the target, which would wipe out the existing
        // rotation images array, quote color, or quote list when the
        // caller did not intend to touch them.
        for (const key of Object.keys(updates) as Array<keyof BannerData>) {
          const value = updates[key];
          if (value !== undefined) {
            (this.embeddedData!.banner as any)[key] = value;
          }
        }
        await this.saveEmbeddedAndRefresh();
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openEmbeddedAddActionModal(): void {
    const modal = new AddActionModal(this.app, async (action) => {
      if (!this.embeddedData) return;
      if (!this.embeddedData.quickActions) this.embeddedData.quickActions = [];
      this.embeddedData.quickActions.push(action);
      await this.saveEmbeddedAndRefresh();
    });
    modal.open();
  }

  private openEmbeddedProjectSearch(colName: string): void {
    const modal = new DocSearchModal(this.app, async (link) => {
      if (!this.embeddedData) return;
      // v1.4.10 — same `addCardData` helper as the workbench /
      // sidebar. The `type: "project"` and the initial
      // `projectDocs` body (single doc, no children) are the
      // sectionType-specific overrides.
      this.embeddedData = SyncEngine.addCardData(this.embeddedData, colName, {
        id: `${Date.now()}-project`,
        title: link.name,
        type: "project",
        // Use the shared helper so the new project card's
        // body is in the canonical wikilink form (basename
        // only, no folder prefix, no ".md" suffix).
        body: pathToWikiLink(link.path),
        projectDocs: [{ path: link.path, children: [] }],
      });
      await this.saveEmbeddedAndRefresh();
    });
    modal.open();
  }

  private openEmbeddedTemplatePicker(colName: string): void {
    const modal = new TemplatePickerModal(
      this.app,
      this.plugin,
      async (template) => {
        if (!this.embeddedData) return;
        // v1.4.10 — same `addCardData` helper as the workbench /
        // sidebar. The template-derived `title` / `type: "task"`
        // / initial `tasks` are the sectionType-specific
        // overrides.
        this.embeddedData = SyncEngine.addCardData(this.embeddedData, colName, {
          id: `${Date.now()}-template`,
          title: template.name,
          type: "task",
          tasks: template.tasks.map((text) => ({ text, checked: false })),
        });
        await this.saveEmbeddedAndRefresh();
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openEmbeddedLibraryConfigModal(colName: string): void {
    const column = this.embeddedData?.columns.find(
      (col) => col.name === colName,
    );
    const existingConfig = column?.libraryConfig ?? {
      filters: [],
      viewMode: "grid" as const,
      sortBy: "modified",
      sortDesc: true,
    };
    const modal = new LibraryConfigModal(
      this.app,
      existingConfig,
      async (config) => {
        const col = this.embeddedData?.columns.find((c) => c.name === colName);
        if (col) {
          col.libraryConfig = config;
          await this.saveEmbeddedAndRefresh();
        }
      },
    );
    modal.open();
  }

  private renderMobileWidgetBar(container: HTMLElement): void {
    this.mobileWidgetTabsOpen = false;
    this.mobileWidgetExpanded = null;

    const bar = container.createDiv({ cls: "dashboard-mobile-widget-bar" });

    // Thin strip: collapsed state, tap to expand tabs
    const strip = bar.createDiv({ cls: "dashboard-mobile-widget-strip" });
    strip.createDiv({ cls: "dashboard-mobile-widget-strip-hint" });
    strip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.mobileWidgetTabsOpen = !this.mobileWidgetTabsOpen;
      if (!this.mobileWidgetTabsOpen) {
        this.mobileWidgetExpanded = null;
      }
      this.refreshMobileWidgetPanel(bar);
    });

    // Tab row: hidden by default, revealed by tapping strip
    const tabs = bar.createDiv({ cls: "dashboard-mobile-widget-tabs" });

    const widgets: Array<{
      key: "pomodoro" | "reading" | "lunar";
      label: string;
      icon: string;
    }> = [
      { key: "pomodoro", label: t("mobile.pomodoro"), icon: "hourglass" },
      { key: "reading", label: t("mobile.reading"), icon: "book-open" },
      { key: "lunar", label: t("mobile.lunar"), icon: "moon" },
    ];

    const panel = bar.createDiv({ cls: "dashboard-mobile-widget-panel" });

    for (const w of widgets) {
      const btn = tabs.createEl("button", {
        cls: "dashboard-mobile-widget-btn",
        attr: {},
      });
      setIcon(btn, w.icon);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.mobileWidgetExpanded === w.key) {
          this.mobileWidgetExpanded = null;
        } else {
          this.mobileWidgetExpanded = w.key;
        }
        this.refreshMobileWidgetPanel(bar);
      });

      btn.dataset.widgetKey = w.key;
    }

    this.refreshMobileWidgetPanel(bar);
  }

  private refreshMobileWidgetPanel(bar: HTMLElement): void {
    const strip = bar.querySelector(".dashboard-mobile-widget-strip");
    const tabs = bar.querySelector(".dashboard-mobile-widget-tabs");
    const panel = bar.querySelector(
      ".dashboard-mobile-widget-panel",
    ) as HTMLElement | null;
    if (!strip || !tabs || !panel) return;

    // Toggle strip active state
    strip.classList.toggle(
      "dashboard-mobile-widget-strip--active",
      this.mobileWidgetTabsOpen,
    );

    // Toggle tabs visibility
    tabs.classList.toggle(
      "dashboard-mobile-widget-tabs--open",
      this.mobileWidgetTabsOpen,
    );

    // Update button active states
    tabs.querySelectorAll(".dashboard-mobile-widget-btn").forEach((btn) => {
      const el = btn as HTMLElement;
      el.classList.toggle(
        "active",
        el.dataset.widgetKey === this.mobileWidgetExpanded,
      );
    });

    // Render panel content
    panel.empty();

    if (!this.mobileWidgetExpanded) {
      panel.removeClass("dashboard-mobile-widget-panel--open");
      return;
    }

    panel.addClass("dashboard-mobile-widget-panel--open");

    if (this.mobileWidgetExpanded === "pomodoro" && this.pomodoroService) {
      renderSidebarPomodoro(panel, this.pomodoroService, this.plugin.settings);
    } else if (this.mobileWidgetExpanded === "reading" && this.readingService) {
      renderSidebarReading(panel, this.readingService);
    } else if (this.mobileWidgetExpanded === "lunar") {
      renderSidebarLunarWidget(panel, this.holidayData, this.app);
    }
  }

  private setupBannerBehavior(bannerEl: HTMLElement): void {
    // The banner now creates its own pin/collapse button, edit
    // button, double-click handler and resize-aware collapsed
    // state inside renderBanner(). This method is kept for API
    // compatibility but no longer adds any listeners — leaving
    // the duplication in place would create two pin buttons and
    // two localStorage keys fighting each other.
  }

  private openMobileDrawer(type: "quickActions" | "recent"): void {
    this.closeMobileDrawer();

    const root = this.containerEl.children[1] as HTMLElement;
    if (!root) return;

    const firstSection = root.querySelector(
      ".dashboard-section-row",
    ) as HTMLElement;
    const drawerTop = firstSection
      ? firstSection.getBoundingClientRect().top
      : 0;

    const drawer = root.createDiv({ cls: "dashboard-mobile-drawer" });
    drawer.style.top = `${drawerTop}px`;

    const content = drawer.createDiv({
      cls: "dashboard-mobile-drawer-content",
    });

    if (type === "quickActions") {
      content.createEl("h4", {
        text: t("mobile.quickActions"),
        cls: "dashboard-mobile-drawer-title",
      });
      if (this.data) {
        renderQuickActions(
          content,
          this.data.quickActions,
          (action) => {
            this.executeAction(action);
            this.closeMobileDrawer();
          },
          async (index) => {
            const confirmed = await showConfirmDialog(this.app, {
              title: t("common.confirmDelete"),
              message: t("common.confirmDeleteMessage"),
            });
            if (!confirmed) return;
            this.sync.removeQuickAction(index);
          },
          () => this.openAddActionModal(),
          undefined,
          undefined,
          this.data.quickActionOrder,
          (order) => this.sync.reorderQuickActions(order),
          async (key) => {
            const confirmed = await showConfirmDialog(this.app, {
              title: t("common.confirmDelete"),
              message: t("common.confirmDeleteMessage"),
            });
            if (!confirmed) return;
            this.sync.removeQuickActionByKey(key);
          },
          this.data.hiddenPresets,
        );
      }
    } else {
      content.createEl("h4", {
        text: t("mobile.recent"),
        cls: "dashboard-mobile-drawer-title",
      });
      const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
      renderRecentDocs(content, docs, (path) => this.navigateToPath(path));
    }

    const backdrop = drawer.createDiv({
      cls: "dashboard-mobile-drawer-backdrop",
    });
    backdrop.addEventListener("click", () => this.closeMobileDrawer());

    requestAnimationFrame(() => {
      content.addClass("dashboard-mobile-drawer-content--open");
    });
  }

  private closeMobileDrawer(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    if (!root) return;
    const existing = root.querySelector(".dashboard-mobile-drawer");
    if (existing) existing.remove();
  }

  private renderSidebar(sidebar: HTMLElement, root: HTMLElement): void {
    if (!this.data) return;

    const scroll = sidebar.createDiv({ cls: "dashboard-sidebar-scroll" });

    renderSidebarWeekCalendar(scroll);

    renderSidebarWidgets(
      scroll,
      this.plugin.settings,
      this.app,
      this.pomodoroService ?? undefined,
      this.readingService ?? undefined,
      this.holidayData,
      async (order) => {
        this.plugin.settings = {
          ...this.plugin.settings,
          widgetOrder: order,
        };
        await this.plugin.saveSettings();
        this.render(this.data!);
      },
    );

    renderQuickActions(
      scroll,
      this.data.quickActions,
      (action) => this.executeAction(action),
      (index) => {
        showConfirmDialog(this.app, {
          title: t("common.confirmDelete"),
          message: t("common.confirmDeleteMessage"),
        }).then((confirmed) => {
          if (confirmed) this.sync.removeQuickAction(index);
        });
      },
      () => this.openAddActionModal(),
      this.sidebarPinned,
      () => {
        this.sidebarPinned = !this.sidebarPinned;
        localStorage.setItem(
          "peingxious-dashboard-sidebar-pinned",
          String(this.sidebarPinned),
        );
        if (this.sidebarPinned) {
          sidebar.addClass("dashboard-sidebar--pinned");
          sidebar.removeClass("dashboard-sidebar--expanded");
          sidebar.removeClass("dashboard-sidebar--collapsed");
          this.sidebarExpanded = false;
        } else {
          sidebar.removeClass("dashboard-sidebar--pinned");
          sidebar.addClass("dashboard-sidebar--collapsed");
          this.sidebarExpanded = false;
        }
      },
      this.data.quickActionOrder,
      (order) => this.sync.reorderQuickActions(order),
      (key) => {
        showConfirmDialog(this.app, {
          title: t("common.confirmDelete"),
          message: t("common.confirmDeleteMessage"),
        }).then((confirmed) => {
          if (confirmed) this.sync.removeQuickActionByKey(key);
        });
      },
      this.data.hiddenPresets,
    );

    const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
    renderRecentDocs(scroll, docs, (path) => this.navigateToPath(path));
  }

  private setupSidebarBehavior(sidebar: HTMLElement, root: HTMLElement): void {
    // Create slim indicator (visible only when collapsed)
    sidebar.createDiv({ cls: "dashboard-sidebar-slim-indicator" });

    // Use capture phase so child handlers can't stopPropagation before we see it
    sidebar.addEventListener(
      "mousedown",
      (e: MouseEvent) => {
        if (this.sidebarPinned) return;
        if (sidebar.hasClass("dashboard-sidebar--collapsed")) {
          e.preventDefault();
          e.stopPropagation();
          sidebar.removeClass("dashboard-sidebar--collapsed");
          sidebar.addClass("dashboard-sidebar--expanded");
          this.sidebarExpanded = true;
        }
      },
      true,
    );

    // Click outside to collapse
    const outsideHandler = (e: MouseEvent) => {
      if (this.sidebarPinned) return;
      if (!this.sidebarExpanded) return;
      if (sidebar.contains(e.target as Node)) return;
      sidebar.removeClass("dashboard-sidebar--expanded");
      sidebar.addClass("dashboard-sidebar--collapsed");
      this.sidebarExpanded = false;
    };
    root.addEventListener("click", outsideHandler);
    this.cleanupFns.push(() =>
      root.removeEventListener("click", outsideHandler),
    );
  }

  private createCallbacks() {
    return {
      onCardEdit: (card: DashboardCard) => this.openCardEditModal(card),
      onCardDelete: async (cardId: string) => {
        // Direct delete (project/memo style): no confirm dialog
        this.sync.deleteCard(cardId);
        new Notice(t("card.deleted"));
      },
      onCheckboxToggle: (cardId: string, idx: number, checked: boolean) =>
        this.sync.toggleTask(cardId, idx, checked),
      onTaskAdd: (cardId: string, text: string) =>
        this.sync.addTask(cardId, text),
      onTaskDelete: (cardId: string, idx: number) => {
        // Direct delete (project/memo style): no confirm dialog
        this.sync.deleteTask(cardId, idx);
      },
      onTaskReorder: (cardId: string, from: number, to: number) =>
        this.sync.reorderTask(cardId, from, to),
      onTaskMoveToCard: (
        srcCardId: string,
        taskIndex: number,
        destCardId: string,
        destIndex: number,
      ) =>
        this.sync.moveTaskToCard(srcCardId, taskIndex, destCardId, destIndex),
      onTaskEdit: (cardId: string, idx: number, text: string) =>
        this.sync.editTask(cardId, idx, text),
      onMemoUpdate: (
        card: DashboardCard,
        updates: { body: string; blockquote: string },
      ) => this.sync.updateMemoCard(card.id, updates),
      onProjectDocsUpdate: (card: DashboardCard, docPaths: string[]) =>
        this.sync.updateProjectDocs(card.id, docPaths),
      onProjectDocsReorder: (cardId: string, from: number, to: number) =>
        this.sync.reorderDocPaths(cardId, from, to),
      onDocMoveToCard: (
        srcCardId: string,
        docIndex: number,
        destCardId: string,
        destIndex: number,
      ) => this.sync.moveDocToCard(srcCardId, docIndex, destCardId, destIndex),
      onProjectDocsAdd: (card: DashboardCard, docPath: string) =>
        this.sync.addDocToCard(card.id, docPath),
      onProjectDocsRemove: (card: DashboardCard, topIndex: number) =>
        this.sync.removeProjectDoc(card.id, topIndex),
      onCardAdd: async (colName: string, options?: { title?: string }) => {
        const column = this.data?.columns.find((col) => col.name === colName);
        const effectiveType = column?.sectionType ?? colName.toLowerCase();
        if (effectiveType === "dashboard") {
          this.openWidgetTypeModal(colName);
        } else if (effectiveType === "memo" || effectiveType === "todo") {
          this.pendingScrollToLastCardOfColumn = colName;
          this.sync.addCard(colName);
        } else if (effectiveType === "todoplus") {
          // TodoPlus section: the caller (renderTodoPlus prompt) has
          // already validated the source wikilink and may have passed
          // a `title` to seed the new card with. We push a pre-typed
          // `type: "todoplus"` card and forward the title so the
          // card body is rendered on the very first refresh — no
          // need for the user to click "Set source" again.
          //
          // Note: there is no per-card `sourceLink` field anymore —
          // the source link lives in the card `title` (a wikilink
          // `[[note#heading]]`).
          //
          // The renderer-side `addTodoPlusCardFromNote` flow already
          // calls `ensureTodoPlusHeading` BEFORE we get here, so this
          // is a defensive idempotent re-run that catches the edge
          // case where the card was added through a code path that
          // didn't go through `addTodoPlusCardFromNote` (e.g. import
          // or future flows). `ensureTodoPlusHeading` is a no-op
          // when the heading is already present, so re-running it
          // costs nothing.
          const title = options?.title?.trim() ?? "";
          if (title) {
            const sourceFile = resolveTodoPlusSourceFile(
              this.app,
              title,
              this.sync.getFile()?.path,
            );
            if (sourceFile) {
              await ensureTodoPlusHeading(this.app, sourceFile, "To-do");
            }
          }
          this.pendingScrollToLastCardOfColumn = colName;
          this.sync.addCard(colName, {
            type: "todoplus",
            ...(title.length > 0 ? { title } : {}),
          });
        } else {
          this.openProjectSearchModal(colName);
        }
      },
      onColumnAdd: (name: string, sectionType?: string) => {
        this.sync.addColumn(name, sectionType).then(() => {
          if (sectionType === "library") {
            this.openLibraryConfigModal(name);
          }
        });
      },
      onBannerEdit: () => {
        if (this.data) this.openBannerEditModal(this.data);
      },
      onQuickActionAdd: () => this.openAddActionModal(),
      onQuickActionRemove: (index: number) => {
        showConfirmDialog(this.app, {
          title: t("common.confirmDelete"),
          message: t("common.confirmDeleteMessage"),
        }).then((confirmed) => {
          if (confirmed) this.sync.removeQuickAction(index);
        });
      },
      onMoveCard: (cardId: string, targetCol: string, targetIdx: number) =>
        this.sync.moveCard(cardId, targetCol, targetIdx),
      onMemoColorChange: (card: DashboardCard, color: string) =>
        this.sync.updateMemoColor(card.id, color),
      onProjectCoverChange: (card: DashboardCard, imagePath: string) =>
        this.sync.updateProjectCover(card.id, imagePath),
      onMemoConvertToNote: async (card: DashboardCard) => {
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
          await this.sync.updateMemoCard(card.id, {
            body: buildMemoLinkedBody(targetPath),
            blockquote: "",
          });
          new Notice(t("memo.converted", { path: targetPath }));
        } catch (e) {
          new Notice(t("memo.convertError", { message: (e as Error).message }));
        }
      },
      onCardTitleEdit: (cardId: string, newTitle: string) =>
        this.sync.updateCard(cardId, { title: newTitle }),
      onCardWidthChange: (cardId: string, width: number) =>
        this.sync.updateCardWidth(cardId, width),
      onCardSizeChange: (cardId: string, size: string) =>
        this.sync.updateCardSize(cardId, size as import("./types").CardSize),
      onTaskHideCompletedChange: (cardId: string, hide: boolean) =>
        this.sync.updateCardHideCompleted(cardId, hide),
      onCardGridChange: (cardId: string, gridCols: number, gridRows: number) =>
        this.sync.updateCardGrid(cardId, gridCols, gridRows),
      onCardGridMove: (cardId: string, gridCol: number, gridRow: number) =>
        this.sync.updateCardGridMove(cardId, gridCol, gridRow),
      onFileDrop: (cardId: string, filePath: string) =>
        this.handleFileDrop(cardId, filePath),
      onProjectItemReorder: (
        cardId: string,
        fromIndex: number,
        toIndex: number,
      ) => this.sync.reorderProjectItem(cardId, fromIndex, toIndex),
      onProjectItemMoveToCard: (
        srcCardId: string,
        itemIndex: number,
        destCardId: string,
        destIndex: number,
      ) =>
        this.sync.moveProjectItemToCard(
          srcCardId,
          itemIndex,
          destCardId,
          destIndex,
        ),
      onProjectItemDelete: (
        cardId: string,
        itemIndex: number,
        itemPath?: string,
      ) => this.sync.removeProjectItem(cardId, itemIndex, itemPath),
      onColumnRename: (oldName: string, newName: string) =>
        this.sync.renameColumn(oldName, newName),
      onColumnDelete: async (columnName: string) => {
        // Protect first column and columns with tags/links
        if (this.data) {
          const idx = this.data.columns.findIndex((c) => c.name === columnName);
          if (
            idx === 0 ||
            columnName.includes("[[") ||
            columnName.includes("#")
          ) {
            new Notice(t("error.cannotDeleteMainColumn"));
            return;
          }
        }
        const confirmed = await showConfirmDialog(this.app, {
          title: t("common.confirmDelete"),
          message: t("renderer.deleteSectionConfirm", { column: columnName }),
        });
        if (confirmed) {
          this.sync.deleteColumn(columnName);
        }
      },
      onColumnSectionTypeChange: (columnName: string, sectionType: string) => {
        // v1.4.9 BUG-003a — fix #2: the data handed to `requestRender`
        // must be the post-mutation snapshot, NOT the pre-call
        // snapshot. The previous version called
        // `setColumnSectionType(...)` (which synchronously updates
        // `sync.data` and fires `notifyCallbacks` → a RAF-coalesced
        // `requestRender(OLD_DATA_REFERENCE)`) and then *re-read*
        // `sync.getData()`. The re-read did pick up the new
        // `sectionType` for the *primitives* on each column, but
        // the columns array itself was the same object reference
        // the render had already started walking — by the time
        // the RAF fired, the render was working against a mix of
        // "new primitives" and "old object identity", which is
        // exactly the symptom the user reported: styles refresh,
        // data does not.
        //
        // v1.4.10 — sectionType migration: the column's `cards` must
        // also be migrated so `card.type` / `card.tasks` /
        // `card.projectDocs` match the new sectionType. Without this
        // step the in-memory cards still carry the old `type: "task"`
        // (or `type: "project"` etc.) and the renderer dispatcher —
        // which now trusts `sectionType` exclusively — will keep
        // rendering the column with the new section's body, but the
        // serializer would still write the old shape to disk on the
        // next save. The migration helper drops / keeps the right
        // fields per target type and is the single source of truth
        // for the per-type card shape.
        //
        // v1.4.10 — unified helper: the workbench callback and the
        // embedded callback now both call the exact same
        // `SyncEngine.setColumnSectionTypeData` helper to compute
        // the post-mutation columns. The two views can no longer
        // drift on the migration step.
        const currentData = this.sync.getData();
        if (!currentData) return;
        // v1.4.10 — `setColumnSectionTypeData` works on the full
        // `DashboardData` (so the migration can stamp each card
        // with the new sectionType-derived shape). It returns
        // the post-mutation `DashboardData` directly, so we use
        // it as `nextData` without re-wrapping it.
        const nextData = SyncEngine.setColumnSectionTypeData(
          currentData,
          columnName,
          sectionType,
        );
        if (nextData === currentData) return;
        // Kick off persistence; the actual re-render uses `nextData`
        // which already reflects the new sectionType in the SAME
        // call frame as the click event.
        this.sync.persistColumnMutation(nextData).catch((e) => {
          console.error("[apex-dashboard] persistColumnMutation failed", e);
        });
        this.requestRender(nextData);
      },
      onColumnArchiveCompletedChange: (columnName: string, archive: boolean) =>
        this.sync.setColumnArchiveCompleted(columnName, archive),
      onTaskReminderEdit: (
        cardId: string,
        taskIndex: number,
        reminder: string | undefined,
      ) => this.sync.editTaskReminder(cardId, taskIndex, reminder),
      onProjectGroupAdd: async (columnName: string, title: string) => {
        const column = this.data?.columns.find((c) => c.name === columnName);
        if (!column) return;
        this.sync.addCard(columnName, {
          id: `${Date.now()}-project`,
          title,
          type: "project",
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
          projectDocs: [],
          gridCols: 0,
          gridRows: 0,
          gridCol: 0,
          gridRow: 0,
          hideCompleted: false,
        });
      },
      onAddFromTemplate: (columnName: string) =>
        this.openTemplatePicker(columnName),
      onLibraryConfigChange: (columnName: string, config: LibraryConfig) =>
        this.sync.updateLibraryConfig(columnName, config),
    };
  }

  private handleFileDrop(cardId: string, filePath: string): void {
    if (!this.data) return;
    let sectionType = "projects";
    let cardType = "generic";
    for (const col of this.data.columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) {
        sectionType = col.sectionType ?? col.name.toLowerCase();
        cardType = card.type;
        break;
      }
    }
    if (cardType === "weather" || cardType === "tracker") return;
    if (cardType === "task" || sectionType === "todo") {
      // Use the shared helper so to-do tasks get the same canonical
      // wikilink form as project items (basename only, no folder
      // prefix, no ".md" suffix).
      this.sync.addTask(cardId, pathToWikiLink(filePath));
    } else if (sectionType === "memo") {
      this.sync.addFileLinkToMemo(cardId, filePath);
    } else {
      this.sync.addDocToCard(cardId, filePath);
    }
  }

  private openBannerEditModal(data: DashboardData): void {
    const modal = new BannerEditModal(
      this.app,
      data.banner,
      (updates) => {
        this.sync.updateBanner(updates);
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openCardEditModal(card: DashboardCard): void {
    const modal = new CardEditModal(
      this.app,
      card,
      (updates) => {
        this.sync.updateCard(card.id, updates);
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openWidgetTypeModal(colName: string): void {
    const modal = new WidgetTypeModal(
      this.app,
      (type: WidgetType) => {
        if (type === "weather") {
          this.openWeatherConfigModal(colName);
        } else if (type === "tracker") {
          this.openTrackerConfigModal(colName);
        }
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openWeatherConfigModal(colName: string): void {
    const modal = new WeatherConfigModal(
      this.app,
      (title, config) => {
        this.sync.addCard(colName, {
          title,
          type: "weather",
          weatherConfig: config,
        });
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openTrackerConfigModal(colName: string): void {
    const modal = new TrackerConfigModal(
      this.app,
      (title, config) => {
        this.sync.addCard(colName, {
          title,
          type: "tracker",
          trackerConfig: config,
        });
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openTemplatePicker(colName: string): void {
    const modal = new TemplatePickerModal(
      this.app,
      this.plugin,
      (template) => {
        this.pendingScrollToLastCardOfColumn = colName;
        this.sync.addCard(colName, {
          title: template.name,
          type: "task",
          tasks: template.tasks.map((text) => ({ text, checked: false })),
        });
      },
      this.plugin.settings.stylePreset,
    );
    modal.open();
  }

  private openLibraryConfigModal(colName: string): void {
    const column = this.data?.columns.find((col) => col.name === colName);
    const existingConfig = column?.libraryConfig ?? {
      filters: [],
      viewMode: "grid" as const,
      sortBy: "modified",
      sortDesc: true,
    };
    const modal = new LibraryConfigModal(this.app, existingConfig, (config) => {
      this.sync.updateLibraryConfig(colName, config);
    });
    modal.open();
  }

  private openAddActionModal(): void {
    const modal = new AddActionModal(this.app, (action) => {
      this.sync.addQuickAction(action);
    });
    modal.open();
  }

  private async executeAction(action: QuickAction): Promise<void> {
    if (action.type === "file") {
      await this.navigateToPath(action.target);
    } else if (action.type === "command") {
      if (action.target === "daily-notes") {
        await this.createNewJournal();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.app as any).commands.executeCommandById(action.target);
      }
    }
  }

  private async createNewJournal(): Promise<void> {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const filePath = `${dateStr}.md`;

    let file = this.app.vault.getFileByPath(filePath);
    if (!file) {
      file = await this.app.vault.create(filePath, `# ${dateStr}\n\n`);
    }

    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private openProjectSearchModal(colName: string): void {
    const modal = new DocSearchModal(this.app, (link) => {
      this.sync.addCard(colName, {
        title: link.name,
        body: `[[${link.path}]]`,
      });
    });
    modal.open();
  }

  private promptAddColumn(): void {
    const name = prompt(t("renderer.sectionName"));
    if (name?.trim()) {
      this.sync.addColumn(name.trim());
    }
  }

  private async navigateToPath(path: string): Promise<void> {
    let file = this.app.vault.getFileByPath(path);
    if (!file && !path.endsWith(".md")) {
      file = this.app.vault.getFileByPath(`${path}.md`);
    }

    if (!file) {
      const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      if (basename) {
        const found = this.app.vault
          .getMarkdownFiles()
          .find((mf) => mf.basename === basename);
        if (found) file = found;
      }
    }

    if (file) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      return;
    }

    const folderPath = path.replace(/\/$/, "");
    const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
    if (abstractFile) {
      const leaves = this.app.workspace.getLeavesOfType("file-explorer");
      if (leaves.length > 0) {
        this.app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
      }
    }
  }

  private registerVaultListeners(): void {
    const events = this.app.vault;
    const handler = () => {
      this.debouncedRefreshRecentDocs();
      this.debouncedRefreshLibrarySections();
    };

    const createRef = events.on("create", handler);
    const modifyRef = events.on("modify", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      // Markdown / dashboard sync fix: when the user edits an .md
      // file in the Obsidian editor, the embedded-mode view must
      // re-parse the file and re-render so that the visible cards
      // reflect the latest markdown content. Without this, the
      // embedded dashboard keeps showing stale data until the user
      // manually re-clicks the tab or restarts Obsidian.
      //
      // Skip the reload when this plugin itself just wrote the
      // embedded file (saveEmbeddedAndRefresh). In that case the
      // in-memory embeddedData is already the post-mutation state
      // and we render from it directly; re-parsing would race
      // with the in-flight render and produce duplicate
      // render cycles.
      if (
        this.isWritingEmbeddedFile &&
        this.embeddedNotePath &&
        file.path === this.embeddedNotePath
      ) {
        return;
      }
      if (this.embeddedNotePath && file.path === this.embeddedNotePath) {
        void this.reloadEmbeddedFromDisk();
      }
      handler();
    });
    const deleteRef = events.on("delete", handler);
    const renameRef = events.on("rename", handler);

    this.vaultEventRefs = [
      { evt: events, ref: createRef },
      { evt: events, ref: modifyRef },
      { evt: events, ref: deleteRef },
      { evt: events, ref: renameRef },
    ];
  }

  /**
   * Re-read the currently active embedded note from disk and re-render
   * the dashboard. Called when vault events report that the file was
   * modified externally (i.e. by the user editing the markdown in
   * Obsidian's editor, not by the plugin's own saveEmbeddedAndRefresh
   * path). The cache is updated so subsequent tab switches serve the
   * fresh data without an extra disk read.
   */
  private async reloadEmbeddedFromDisk(): Promise<void> {
    const notePath = this.embeddedNotePath;
    if (!notePath) return;
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;
    try {
      const content = await this.app.vault.read(file);
      const data = parse(content);
      this.embeddedData = data;
      this.embeddedDataCache.set(notePath, data);
      const currentData = this.sync.getData();
      if (currentData) this.requestRender(currentData);
    } catch (err) {
      reportError(
        "[peingxious-dashboard]",
        "Error reloading embedded note from disk",
        err,
      );
    }
  }

  /**
   * Global Ctrl/Cmd+Z listener: pops the most recent undo entry from
   * the sync engine and shows a Notice with the operation that was
   * reversed. Skipped when the user is typing in an input/textarea
   * (e.g. the card-edit modal) so Obsidian's own undo continues to
   * work inside text fields.
   */
  private registerUndoShortcut(): void {
    this.registerDomEvent(document, "keydown", (evt) => {
      const isUndoCombo =
        (evt.ctrlKey || evt.metaKey) &&
        !evt.shiftKey &&
        !evt.altKey &&
        !evt.repeat &&
        (evt.key === "z" || evt.key === "Z");
      if (!isUndoCombo) return;

      // Let text fields handle their own undo.
      const target = evt.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }

      if (!this.sync.canUndo()) return;

      evt.preventDefault();
      void this.undoLast().then((label) => {
        if (label) {
          new Notice(label);
        } else {
          new Notice(t("undo.nothing"));
        }
      });
    });
  }

  private unregisterVaultListeners(): void {
    for (const { evt, ref } of this.vaultEventRefs) {
      evt.offref(ref as Parameters<typeof evt.offref>[0]);
    }
    this.vaultEventRefs = [];
    if (this.recentDocsTimer) {
      clearTimeout(this.recentDocsTimer);
      this.recentDocsTimer = null;
    }
    if (this.libraryRefreshTimer) {
      clearTimeout(this.libraryRefreshTimer);
      this.libraryRefreshTimer = null;
    }
  }

  private debouncedRefreshRecentDocs(): void {
    if (this.recentDocsTimer) clearTimeout(this.recentDocsTimer);
    this.recentDocsTimer = setTimeout(() => {
      this.refreshRecentDocs();
    }, this.RECENT_DOCS_DEBOUNCE);
  }

  private debouncedRefreshLibrarySections(): void {
    if (!this.data) return;
    const hasLibrary = this.data.columns.some(
      (col) => col.sectionType === "library",
    );
    if (!hasLibrary) return;
    if (this.libraryRefreshTimer) clearTimeout(this.libraryRefreshTimer);
    this.libraryRefreshTimer = setTimeout(() => {
      const data = this.sync.getData();
      if (data) this.requestRender(data);
    }, 500);
  }

  private refreshRecentDocs(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    if (!root) return;

    const recentSection = root.querySelector(".dashboard-recent");
    if (!recentSection) return;

    const parent = recentSection.parentElement;
    if (!parent) return;

    recentSection.remove();
    const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
    renderRecentDocs(parent, docs, (path) => this.navigateToPath(path));
  }

  private runCleanup(): void {
    destroyAllCharts();
    if (this.pomodoroService) {
      this.pomodoroService.setOnTick(null);
      this.pomodoroService.setOnComplete(null);
    }
    if (this.readingService) {
      this.readingService.setOnTick(null);
    }
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    // Banner handles own their own setInterval timers; dispose
    // them so a re-render doesn't leak two more timers on top of
    // the old ones.
    for (const handle of this.bannerHandles) handle.dispose();
    this.bannerHandles = [];
  }

  private startReminderChecker(): void {
    this.checkReminders();
    this.reminderTimer = setInterval(
      () => this.checkReminders(),
      DashboardView.REMINDER_CHECK_MS,
    );
  }

  private stopReminderChecker(): void {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  private startWeatherRefresh(): void {
    this.weatherRefreshTimer = setInterval(() => {
      if (!this.data) return;
      const hasWeather = this.data.columns.some((col) =>
        col.cards.some((c) => c.type === "weather"),
      );
      if (hasWeather) {
        this.requestRender(this.data);
      }
    }, DashboardView.WEATHER_REFRESH_MS);
  }

  private stopWeatherRefresh(): void {
    if (this.weatherRefreshTimer) {
      clearInterval(this.weatherRefreshTimer);
      this.weatherRefreshTimer = null;
    }
    clearWeatherCache();
  }

  private checkReminders(): void {
    if (!this.data) return;
    const now = new Date();

    for (const col of this.data.columns) {
      for (const card of col.cards) {
        for (let i = 0; i < card.tasks.length; i++) {
          const task = card.tasks[i]!;
          if (!task.reminder || task.checked) continue;

          const key = `${card.id}-${i}`;
          if (this.firedReminders.has(key)) continue;

          const parts = task.reminder.trim().split(/\s+/);
          if (parts.length < 2) continue;
          const [dateStr, timeStr] = parts;
          const [year, month, day] = dateStr!.split("-").map(Number);
          const [hour, min] = timeStr!.split(":").map(Number);
          if (!year || !month || !day) continue;
          const due = new Date(year, month - 1, day, hour ?? 0, min ?? 0);

          if (now >= due) {
            this.firedReminders.add(key);
            const cleanText = task.text.replace(/\[\[[^\]]+\]\]/g, (match) => {
              const inner = match.slice(2, -2);
              return (
                inner
                  .split("|")
                  .pop()
                  ?.split("/")
                  .pop()
                  ?.replace(/\.md$/, "") ?? inner
              );
            });
            this.showReminderModal(cleanText, card.id, i);
          }
        }
      }

      // Countdown reminder
      if (
        this.plugin.settings.countdownEnabled &&
        this.plugin.settings.countdownTargetDate &&
        this.plugin.settings.countdownReminderDays > 0
      ) {
        const ckKey = "countdown-remind";
        if (!this.firedReminders.has(ckKey)) {
          const raw = this.plugin.settings.countdownTargetDate;
          const target = raw.includes("T")
            ? new Date(raw)
            : new Date(raw + "T00:00:00");
          const diffMs = target.getTime() - now.getTime();
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (
            daysLeft >= 0 &&
            daysLeft <= this.plugin.settings.countdownReminderDays
          ) {
            this.firedReminders.add(ckKey);
            const label =
              this.plugin.settings.countdownLabel ||
              this.plugin.settings.countdownTargetDate;
            new Notice(
              t("countdown.reminderNotice", { label, days: String(daysLeft) }),
            );
          }
        }
      }
    }
  }

  private showReminderModal(
    taskText: string,
    cardId: string,
    taskIndex: number,
  ): void {
    const modal = new ReminderNoticeModal(
      this.app,
      taskText,
      () => {
        this.sync.editTaskReminder(cardId, taskIndex, undefined);
      },
      () => {
        const snoozed = new Date(Date.now() + 60 * 60 * 1000);
        const pad = (n: number) => String(n).padStart(2, "0");
        const newReminder = `${snoozed.getFullYear()}-${pad(snoozed.getMonth() + 1)}-${pad(snoozed.getDate())} ${pad(snoozed.getHours())}:${pad(snoozed.getMinutes())}`;
        this.firedReminders.delete(`${cardId}-${taskIndex}`);
        this.sync.editTaskReminder(cardId, taskIndex, newReminder);
      },
    );
    modal.open();
  }
}

/**
 * Resolves a TodoPlus source title (the wikilink form
 * `[[note#heading]]` or the bare `note#heading` form) to a real
 * `TFile` in the vault. Returns `null` when the title is empty,
 * the link can't be parsed, or the file does not exist.
 *
 * Mirrors the parsing rules of `parseTodoPlusSourceLink` in
 * `renderer.ts` (strip `[[ ]]`, strip `|alias`, split on first
 * `#`); the heading portion is intentionally discarded here
 * because the view only needs the file handle to pass to
 * `ensureTodoPlusHeading`. We deliberately re-implement the
 * minimal parse locally rather than export the renderer helper
 * (keeping the renderer-private API surface unchanged).
 */
function resolveTodoPlusSourceFile(
  app: App,
  title: string,
  sourcePath?: string,
): TFile | null {
  const text = title.trim();
  if (!text) return null;
  // Strip `[[ ]]` wrapper.
  const inner = text.replace(/^\[\[/, "").replace(/]]$/, "").trim();
  // Strip `|alias` tail.
  const pipeIdx = inner.indexOf("|");
  const linkPart = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
  // Split on first `#` — we only need the path.
  const hashIdx = linkPart.indexOf("#");
  const path = (hashIdx >= 0 ? linkPart.slice(0, hashIdx) : linkPart).trim();
  if (!path) return null;
  // Use Obsidian's standard wikilink resolver (handles basename-only
  // links, same-basename disambiguation, etc.) instead of plain
  // `vault.getFileByPath`, which requires a full vault-relative path.
  const resolved = app.metadataCache.getFirstLinkpathDest(
    path,
    sourcePath ?? "",
  );
  return resolved instanceof TFile ? resolved : null;
}
