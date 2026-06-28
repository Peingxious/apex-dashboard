import { App, TFile, Notice } from "obsidian";
import type {
  DashboardSettings,
  DashboardCard,
  DashboardData,
  TaskItem,
  QuickAction,
  BannerData,
  CardType,
  DashboardColumn,
  ProjectDocNode,
} from "./types";
import {
  parse,
  serialize,
  serializeInto,
  generateEmptyDashboardMarkdown,
  pathToWikiLink,
  migrateCardsForSectionType,
} from "./parser";
import { t } from "./i18n";

type DataCallback = (data: DashboardData) => void;

const KNOWN_METADATA_KEYS = new Set([
  "link",
  "progress",
  "due",
  "streak",
  "type",
]);

/**
 * Undo entry: a snapshot of the data removed by a destructive op,
 * plus the position/identifier needed to restore it in-place.
 *
 * Only the recent "one-click" deletes are tracked — sort/toggle/text
 * edits are handled by Obsidian's own editor Ctrl+Z.
 */
type UndoEntry =
  | {
      kind: "card";
      columnName: string;
      cardIndex: number;
      card: DashboardCard;
    }
  | {
      kind: "task";
      cardId: string;
      taskIndex: number;
      task: TaskItem;
    }
  | {
      kind: "projectItem";
      cardId: string;
      /** Path hint (wikilink basename) used to relocate the item at restore time. */
      itemPath?: string;
      /** Lines (including any indented children) that were spliced out of card.body. */
      removedLines: string[];
      /** Wikilink path captured at removal time, used to re-insert into projectDocs. */
      removedPath?: string;
      /** Index inside card.projectDocs from which the doc entry was dropped. */
      removedProjectDocIdx: number;
    }
  | {
      kind: "column";
      columnIndex: number;
      column: DashboardColumn;
    };

export class SyncEngine {
  private app: App;
  private settings: DashboardSettings;
  private file: TFile | null = null;
  private data: DashboardData | null = null;
  private lastWrittenHash = "";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 300;
  private writeQueue: Promise<void> = Promise.resolve();
  private callbacks: DataCallback[] = [];
  private eventRef: ReturnType<typeof this.app.vault.on> | null = null;
  /** Stack of in-memory undo entries for the most recent destructive ops. */
  private undoStack: UndoEntry[] = [];
  private static readonly MAX_UNDO = 50;
  private hideCompletedOverrides = new Map<string, boolean>();

  constructor(app: App, settings: DashboardSettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: DashboardSettings): void {
    this.settings = settings;
  }

  onDataUpdate(cb: DataCallback): void {
    this.callbacks.push(cb);
  }

  async init(): Promise<void> {
    await this.findOrCreateFile();
    this.registerFileWatcher();
    await this.load();
  }

  /**
   * Returns the underlying dashboard `TFile` for the workspace.
   * Used by the main tab's double-click affordance to open the
   * actual markdown note that backs the dashboard, in place of
   * the bare "no underlying note" notice. Returns `null` only
   * if `init()` has not finished yet or the file could not be
   * located/created.
   */
  getFile(): TFile | null {
    return this.file;
  }

  destroy(): void {
    if (this.eventRef) {
      this.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    if (this.renameEventRef) {
      this.app.vault.offref(this.renameEventRef);
      this.renameEventRef = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.deferredWriteTimer) {
      clearTimeout(this.deferredWriteTimer);
    }
  }

  getData(): DashboardData | null {
    return this.data;
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  /**
   * Public undo hook (bound to Ctrl/Cmd+Z by the view).
   * Returns a short human-readable label for the operation that was
   * undone, or null if there was nothing to undo.
   */
  async undo(): Promise<string | null> {
    const entry = this.undoStack.pop();
    if (!entry || !this.data) return null;
    const label = this.applyUndo(entry);
    await this.writeToDisk();
    return label;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Inverse of `undo()`: push a snapshot of the data we just removed. */
  private pushUndo(entry: UndoEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > SyncEngine.MAX_UNDO) {
      this.undoStack.shift();
    }
  }

  private applyUndo(entry: UndoEntry): string {
    switch (entry.kind) {
      case "card": {
        const col = this.data!.columns.find((c) => c.name === entry.columnName);
        if (col) {
          const insertAt = Math.min(entry.cardIndex, col.cards.length);
          col.cards.splice(insertAt, 0, entry.card);
        }
        return t("undo.card", { title: entry.card.title || "" });
      }
      case "task": {
        for (const col of this.data!.columns) {
          const card = col.cards.find((c) => c.id === entry.cardId);
          if (card) {
            const insertAt = Math.min(entry.taskIndex, card.tasks.length);
            card.tasks.splice(insertAt, 0, entry.task);
            break;
          }
        }
        return t("undo.task", { text: entry.task.text || "" });
      }
      case "projectItem": {
        for (const col of this.data!.columns) {
          const card = col.cards.find((c) => c.id === entry.cardId);
          if (!card) continue;
          const lines = (card.body ?? "").split("\n");
          // Re-locate the insertion point: prefer the path hint, then
          // the original index, then fall back to the end of the body.
          let insertAt = -1;
          if (entry.itemPath) {
            const target = entry.itemPath.trim();
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i] ?? "";
              if (!l.trim()) continue;
              const depth = l.match(/^(\t*)/)?.[1]?.length ?? 0;
              if (depth !== 0) continue;
              const m = l.replace(/^-+\s*/, "").match(/^\[\[([^\]|]+)/);
              if (m && m[1] && pathToWikiLink(m[1]).slice(2, -2) === target) {
                insertAt = i;
                break;
              }
            }
          }
          if (insertAt < 0) insertAt = lines.length;
          lines.splice(insertAt, 0, ...entry.removedLines);
          card.body = lines.join("\n");

          // Mirror restore into projectDocs if a path was captured.
          if (entry.removedPath) {
            const projectDocs = (card as { projectDocs?: ProjectDocNode[] })
              .projectDocs;
            const normalized: ProjectDocNode[] = Array.isArray(projectDocs)
              ? projectDocs.map((d) => ({
                  path: d.path,
                  children: d.children ?? [],
                }))
              : [];
            const idx = Math.min(entry.removedProjectDocIdx, normalized.length);
            normalized.splice(idx, 0, {
              path: entry.removedPath,
              children: [],
            });
            (card as { projectDocs?: ProjectDocNode[] }).projectDocs =
              normalized;
          }
          break;
        }
        return t("undo.projectItem", {
          title: entry.itemPath || "",
        });
      }
      case "column": {
        const insertAt = Math.min(entry.columnIndex, this.data!.columns.length);
        this.data!.columns.splice(insertAt, 0, entry.column);
        return t("undo.column", { name: entry.column.name || "" });
      }
    }
  }

  async toggleTask(
    cardId: string,
    taskIndex: number,
    checked: boolean,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.toggleTaskData(
      this.data,
      cardId,
      taskIndex,
      checked,
    );
    await this.writeToDisk();
  }

  async reorderTask(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.reorderTaskData(
      this.data,
      cardId,
      fromIndex,
      toIndex,
    );
    await this.writeToDisk();
  }

  async moveTaskToCard(
    srcCardId: string,
    taskIndex: number,
    destCardId: string,
    destIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.moveTaskToCardData(
      this.data,
      srcCardId,
      taskIndex,
      destCardId,
      destIndex,
    );
    await this.writeToDisk();
  }

  async editTask(
    cardId: string,
    taskIndex: number,
    newText: string,
  ): Promise<void> {
    if (!this.data || !newText) return;
    this.data = SyncEngine.editTaskData(this.data, cardId, taskIndex, newText);
    await this.writeToDisk();
  }

  async addTask(cardId: string, text: string): Promise<void> {
    if (!this.data || !text.trim()) return;
    this.data = SyncEngine.addTaskData(this.data, cardId, text);
    await this.writeToDisk();
  }

  async deleteTask(cardId: string, taskIndex: number): Promise<void> {
    if (!this.data) return;

    // Snapshot the task before removal so Ctrl+Z can restore it.
    let snapshot: TaskItem | undefined;
    for (const col of this.data.columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card && card.tasks[taskIndex]) {
        snapshot = { ...card.tasks[taskIndex]! };
        break;
      }
    }
    if (snapshot) {
      this.pushUndo({ kind: "task", cardId, taskIndex, task: snapshot });
    }

    this.data = SyncEngine.deleteTaskData(this.data, cardId, taskIndex);
    await this.writeToDisk();
  }

  async updateCard(
    cardId: string,
    updates: Partial<
      Pick<
        DashboardCard,
        | "title"
        | "body"
        | "dueDate"
        | "color"
        | "coverImage"
        | "width"
        | "size"
        | "gridCols"
        | "gridRows"
        | "gridCol"
        | "gridRow"
        | "hideCompleted"
      >
    >,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.patchCardData(this.data, cardId, updates);
    await this.writeToDisk();
  }

  async editTaskReminder(
    cardId: string,
    taskIndex: number,
    reminder: string | undefined,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.editTaskReminderData(
      this.data,
      cardId,
      taskIndex,
      reminder,
    );
    await this.writeToDisk();
  }

  async deleteCard(cardId: string): Promise<void> {
    if (!this.data) return;
    this.hideCompletedOverrides.delete(cardId);

    // Snapshot the card (and the column + index it was on) so Ctrl+Z
    // can restore it to exactly the same slot.
    let snapshot: {
      columnName: string;
      cardIndex: number;
      card: DashboardCard;
    } | null = null;
    for (const col of this.data.columns) {
      const idx = col.cards.findIndex((c) => c.id === cardId);
      if (idx >= 0) {
        snapshot = {
          columnName: col.name,
          cardIndex: idx,
          card: { ...col.cards[idx]!, tasks: [...col.cards[idx]!.tasks] },
        };
        break;
      }
    }
    if (snapshot) this.pushUndo({ kind: "card", ...snapshot });

    this.data = SyncEngine.removeCardData(this.data, cardId);
    await this.writeToDisk();
  }

  async addCard(
    columnName: string,
    overrides?: Partial<DashboardCard>,
  ): Promise<void> {
    if (!this.data) return;
    const column = this.data.columns.find((col) => col.name === columnName);
    const sectionType = column?.sectionType;
    const cardTitle =
      overrides?.title ?? this.getDefaultCardTitle(columnName, sectionType);
    const cardType =
      overrides?.type ?? this.getDefaultCardType(columnName, sectionType);

    const newCard: DashboardCard = {
      id: `card-${Date.now().toString(36)}`,
      title: cardTitle,
      type: cardType,
      column: columnName,
      body: "",
      tasks:
        cardType === "task"
          ? [{ text: t("sync.todoDefaultTask"), checked: false }]
          : [],
      url: "",
      wikiLink: "",
      progress: -1,
      streak: 0,
      dueDate: "",
      blockquote: "",
      color: "",
      coverImage: "",
      width: 0,
      size: "M" as const,
      gridCols: 0,
      gridRows: 0,
      gridCol: 0,
      gridRow: 0,
      hideCompleted: false,
      ...overrides,
    };

    this.data = SyncEngine.addCardData(this.data, columnName, newCard);
    await this.writeToDisk();
  }

  async addColumn(name: string, sectionType?: string): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.addColumnData(this.data, name, sectionType);
    await this.writeToDisk();
  }

  async updateLibraryConfig(
    columnName: string,
    config: import("./types").LibraryConfig,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.patchColumnData(this.data, columnName, {
      libraryConfig: config,
    });
    await this.writeToDisk();
  }

  async renameColumn(oldName: string, newName: string): Promise<void> {
    if (!this.data || !newName || oldName === newName) return;
    this.data = SyncEngine.renameColumnData(this.data, oldName, newName);
    await this.writeToDisk();
  }

  async setColumnSectionType(
    columnName: string,
    sectionType: string,
  ): Promise<void> {
    if (!this.data) return;
    // v1.4.9 BUG-003a / BUG-003c: switch to a columns-only write path
    // (processFrontMatter) so the banner block, extra frontmatter and
    // comment lines in `dashboard.md` stay byte-identical. The old
    // full-file rewrite also dropped the re-render signal on the
    // floor (the vault 'modify' listener only refreshes library
    // sections; the dashboard view itself only re-renders via the
    // explicit `notifyCallbacks` here). Going through
    // `updateColumnsField` guarantees the data update is followed by
    // a synchronous `notifyCallbacks` → `view.requestRender(newData)`.
    //
    // v1.4.10 — also migrate the column's cards so `card.type` /
    // `card.tasks` / `card.projectDocs` match the new sectionType.
    // The view's `onColumnSectionTypeChange` callback also does the
    // migration explicitly and goes through `persistColumnMutation`
    // (the frontmatter-only write). The two entry-points converge
    // on the same `setColumnSectionTypeData` helper to guarantee
    // identical behaviour.
    const nextData = SyncEngine.setColumnSectionTypeData(
      this.data,
      columnName,
      sectionType,
    );
    if (nextData === this.data) return;
    this.data = nextData;
    await this.persistColumnMutation(nextData);
  }

  /**
   * Persist the per-column "auto-archive completed cards" state.
   * The new value is reflected in the dashboard file's `columns:`
   * block as `archiveCompleted: true|false`. There is no "reset"
   * mode for this property: the user is always ON or OFF (the
   * renderer's default is ON when the frontmatter key is absent,
   * so writing the property explicitly to `true` is a no-op
   * semantically — but we still write it so the user's choice
   * is visible in the file).
   */
  async setColumnArchiveCompleted(
    columnName: string,
    archive: boolean,
  ): Promise<void> {
    if (!this.data) return;
    // v1.4.9 BUG-003c: columns-only write path (see
    // `setColumnSectionType` for rationale). v1.4.10 — funnel
    // through the same `setColumnArchiveCompletedData` helper as
    // the embedded view so the two paths can no longer drift.
    const nextData = SyncEngine.setColumnArchiveCompletedData(
      this.data,
      columnName,
      archive,
    );
    if (nextData === this.data) return;
    this.data = nextData;
    await this.persistColumnMutation(nextData);
  }

  async deleteColumn(name: string): Promise<void> {
    if (!this.data) return;

    // Snapshot the column (and its position) so Ctrl+Z can restore it.
    const idx = this.data.columns.findIndex((col) => col.name === name);
    if (idx >= 0) {
      const col = this.data.columns[idx]!;
      this.pushUndo({
        kind: "column",
        columnIndex: idx,
        column: { ...col, cards: [...col.cards] },
      });
    }

    this.data = SyncEngine.deleteColumnData(this.data, name);
    await this.writeToDisk();
  }

  async moveCard(
    cardId: string,
    targetColumn: string,
    targetIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.moveCardData(
      this.data,
      cardId,
      targetColumn,
      targetIndex,
    );
    await this.writeToDisk();
  }

  async updateBanner(updates: Partial<BannerData>): Promise<void> {
    if (!this.data) return;
    this.data = {
      ...this.data,
      banner: { ...this.data.banner, ...updates },
    };
    await this.writeToDisk();
  }

  async addQuickAction(action: QuickAction): Promise<void> {
    if (!this.data) return;
    this.data = {
      ...this.data,
      quickActions: [...this.data.quickActions, action],
    };
    await this.writeToDisk();
  }

  async removeQuickAction(index: number): Promise<void> {
    if (!this.data) return;
    this.data = {
      ...this.data,
      quickActions: this.data.quickActions.filter((_, i) => i !== index),
    };
    await this.writeToDisk();
  }

  async reorderQuickActions(order: string[]): Promise<void> {
    if (!this.data) return;
    this.data = {
      ...this.data,
      quickActionOrder: order,
    };
    await this.writeToDisk();
  }

  async removeQuickActionByKey(key: string): Promise<void> {
    if (!this.data) return;
    if (key.startsWith("p:")) {
      // Preset: add to hiddenPresets and remove from order
      const hidden = [...(this.data.hiddenPresets ?? [])];
      if (!hidden.includes(key)) hidden.push(key);
      this.data = {
        ...this.data,
        hiddenPresets: hidden,
        quickActionOrder: (this.data.quickActionOrder ?? []).filter(
          (k) => k !== key,
        ),
      };
    } else {
      // Custom: remove from quickActions[] and order
      const target = key.slice(2);
      this.data = {
        ...this.data,
        quickActions: this.data.quickActions.filter((a) => a.target !== target),
        quickActionOrder: (this.data.quickActionOrder ?? []).filter(
          (k) => k !== key,
        ),
      };
    }
    await this.writeToDisk();
  }

  async updateMemoCard(
    cardId: string,
    updates: { body: string; blockquote: string },
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.patchCardData(this.data, cardId, updates);
    await this.writeToDisk();
  }

  async reorderDocPaths(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.reorderDocPathsData(
      this.data,
      cardId,
      fromIndex,
      toIndex,
    );
    await this.writeToDisk();
  }

  async moveDocToCard(
    srcCardId: string,
    docIndex: number,
    destCardId: string,
    destIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.moveDocToCardData(
      this.data,
      srcCardId,
      docIndex,
      destCardId,
      destIndex,
    );
    await this.writeToDisk();
  }

  async updateProjectDocs(cardId: string, docPaths: string[]): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.updateProjectDocsData(this.data, cardId, docPaths);
    await this.writeToDisk();
  }

  /**
   * Generic, pure, immutable card-mapper. Returns a new `DashboardData`
   * with the card matching `cardId` replaced by `updater(card)`. If
   * no card matches, the input is returned unchanged. The single
   * "find card → map card → replace card" loop lives in one place,
   * which means the workbench view, the embedded view, and any
   * future caller can no longer drift on the closure-vs-data-object
   * split (the previous embedded callbacks re-implemented this loop
   * inline via `findEmbeddedCard` and mutated the card in place —
   * the canonical source of the "添加到第三卡片会跑到第一卡片" bug).
   */
  static mapCardData(
    data: DashboardData,
    cardId: string,
    updater: (card: DashboardCard) => DashboardCard,
  ): DashboardData {
    return {
      ...data,
      columns: data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) =>
          card.id === cardId ? updater(card) : card,
        ),
      })),
    };
  }

  /**
   * Generic, pure, immutable column-mapper by name. Returns a new
   * `DashboardData` with the column whose `name` matches `columnName`
   * replaced by `updater(column)`. If no column matches, the input
   * is returned unchanged. Mirrors `mapCardData` for column-level
   * operations.
   */
  static mapColumnData(
    data: DashboardData,
    columnName: string,
    updater: (col: DashboardColumn) => DashboardColumn,
  ): DashboardData {
    return {
      ...data,
      columns: data.columns.map((col) =>
        col.name === columnName ? updater(col) : col,
      ),
    };
  }

  /**
   * Pure data-mutation helper for partial card updates. Equivalent
   * to `mapCardData(data, cardId, c => ({ ...c, ...updates }))` but
   * with a stable name and shape that both the workbench `updateCard`
   * method and every embedded "field update" callback route through.
   * Returns the input unchanged if no card matches `cardId`.
   */
  static patchCardData(
    data: DashboardData,
    cardId: string,
    updates: Partial<DashboardCard>,
  ): DashboardData {
    return SyncEngine.mapCardData(data, cardId, (card) => ({
      ...card,
      ...updates,
    }));
  }

  /**
   * Pure data-mutation helper for card removal. Returns a new data
   * object with the matching card filtered out of its column. The
   * single source of truth for "delete this card by id" — the
   * workbench `deleteCard` undo-snapshot logic and the embedded
   * "remove card" code path both use it.
   */
  static removeCardData(data: DashboardData, cardId: string): DashboardData {
    return {
      ...data,
      columns: data.columns.map((col) => ({
        ...col,
        cards: col.cards.filter((c) => c.id !== cardId),
      })),
    };
  }

  /**
   * Pure data-mutation helper for adding a new empty column. Mirrors
   * the workbench `addColumn` shape: `color: "#6366f1"`,
   * `sectionType` defaults to `"project"`, `cards: []`. Returns the
   * input unchanged if a column with the same name already exists
   * (workbench behaviour: it shows a notice, embedded just no-ops).
   */
  static addColumnData(
    data: DashboardData,
    name: string,
    sectionType?: string,
  ): DashboardData {
    if (data.columns.some((c) => c.name === name)) return data;
    return {
      ...data,
      columns: [
        ...data.columns,
        {
          name,
          color: "#6366f1",
          sectionType: sectionType || "project",
          cards: [],
        },
      ],
    };
  }

  /**
   * Pure data-mutation helper for renaming a column in place. The
   * column's `name` is updated AND every card whose `column` field
   * referenced the old name is rewritten to the new name, so a
   * serialized round-trip finds every card back in the right column.
   */
  static renameColumnData(
    data: DashboardData,
    oldName: string,
    newName: string,
  ): DashboardData {
    if (!newName || oldName === newName) return data;
    return {
      ...data,
      columns: data.columns.map((col) => {
        if (col.name !== oldName) return col;
        return {
          ...col,
          name: newName,
          cards: col.cards.map((card) =>
            card.column === oldName ? { ...card, column: newName } : card,
          ),
        };
      }),
    };
  }

  /**
   * Pure data-mutation helper for deleting a column by name.
   * Returns the input unchanged if no column matches. The workbench
   * keeps the "first column / [[…]] / #… protected" guard on its
   * own (because it needs to surface a Notice); this helper is the
   * mechanical "remove by name" piece.
   */
  static deleteColumnData(data: DashboardData, name: string): DashboardData {
    return {
      ...data,
      columns: data.columns.filter((c) => c.name !== name),
    };
  }

  /**
   * Pure data-mutation helper for partial column updates. The
   * `libraryConfig` / column-banner / `dueSoonDays` style fields
   * are all single-column tweaks that share this one path. The
   * helper returns the input unchanged when no column matches the
   * name.
   */
  static patchColumnData(
    data: DashboardData,
    columnName: string,
    updates: Partial<DashboardColumn>,
  ): DashboardData {
    return SyncEngine.mapColumnData(data, columnName, (col) => ({
      ...col,
      ...updates,
    }));
  }

  /**
   * Pure data-mutation helper for changing a column's `sectionType`
   * AND migrating the column's cards so `card.type` /
   * `card.tasks` / `card.projectDocs` match the new sectionType.
   * The two operations are bundled so callers can no longer flip
   * the sectionType without re-deriving the per-card shape — that
   * "stale `card.type`" condition is the historical source of the
   * "switch section type → serializer writes the old card shape"
   * regression.
   */
  static setColumnSectionTypeData(
    data: DashboardData,
    columnName: string,
    sectionType: string,
  ): DashboardData {
    return {
      ...data,
      columns: data.columns.map((col) => {
        if (col.name !== columnName) return col;
        return {
          ...col,
          sectionType,
          cards: migrateCardsForSectionType(col.cards, sectionType),
        };
      }),
    };
  }

  /**
   * Pure data-mutation helper for the per-column "archive completed
   * tasks" toggle. The flag lives on the column (not the card) so
   * a single helper is enough; the workbench `setColumnArchiveCompleted`
   * and the embedded `onColumnArchiveCompletedChange` callback both
   * go through it.
   */
  static setColumnArchiveCompletedData(
    data: DashboardData,
    columnName: string,
    archive: boolean,
  ): DashboardData {
    return SyncEngine.mapColumnData(data, columnName, (col) => ({
      ...col,
      archiveCompleted: archive,
    }));
  }

  /**
   * Pure data-mutation helper for moving a card to a different
   * column / index. Updates the card's `.column` field AND moves
   * it in the cards arrays so the on-disk serialization (which
   * walks columns → cards) sees the card in its new home. Returns
   * the input unchanged if the source card is not found or the
   * destination column is not found.
   */
  static moveCardData(
    data: DashboardData,
    cardId: string,
    targetColumn: string,
    targetIndex: number,
  ): DashboardData {
    let movedCard: DashboardCard | null = null;
    const without = {
      ...data,
      columns: data.columns.map((col) => {
        const idx = col.cards.findIndex((c) => c.id === cardId);
        if (idx === -1) return col;
        const [m] = col.cards.splice(idx, 1);
        if (m) movedCard = m;
        return { ...col, cards: [...col.cards] };
      }),
    };
    if (!movedCard) return data;
    return {
      ...without,
      columns: without.columns.map((col) => {
        if (col.name !== targetColumn) return col;
        movedCard!.column = targetColumn;
        const clamped = Math.min(targetIndex, col.cards.length);
        return {
          ...col,
          cards: [
            ...col.cards.slice(0, clamped),
            movedCard!,
            ...col.cards.slice(clamped),
          ],
        };
      }),
    };
  }

  /**
   * Pure data-mutation helper for the dispatch in `onFileDrop`.
   * Handles the three cases the renderer asks for: todo, memo,
   * and "everything else" (which is project). Returns the input
   * unchanged when the card's type is `weather` or `tracker` (the
   * drop is silently dropped, matching the previous workbench and
   * embedded behaviour).
   */
  static addFileLinkData(
    data: DashboardData,
    cardId: string,
    filePath: string,
    sectionType: string,
    cardType: string,
  ): DashboardData {
    if (cardType === "weather" || cardType === "tracker") return data;
    if (cardType === "task" || sectionType === "todo") {
      return SyncEngine.mapCardData(data, cardId, (card) => ({
        ...card,
        tasks: [
          ...card.tasks,
          { text: pathToWikiLink(filePath), checked: false },
        ],
      }));
    }
    if (sectionType === "memo") {
      return SyncEngine.mapCardData(data, cardId, (card) => {
        const link = pathToWikiLink(filePath);
        if (card.body.includes(link)) return card;
        const body = card.body ? `${card.body}\n${link}` : link;
        return { ...card, body };
      });
    }
    // Project / "everything else" — use the shared 3-way wrap rule
    // and the body+projectDocs lockstep. This is the same logic as
    // addDocToCardData; routed through the file-link entry point
    // so the two callers (renderer drag-drop and
    // `onProjectDocsAdd`) cannot drift.
    return SyncEngine.addDocToCardData(data, cardId, filePath);
  }

  /**
   * Pure data-mutation helper for adding a new project-group card
   * (a `type: "project"` card with empty body and an empty
   * `projectDocs`) to a column. The id is derived from the
   * timestamp + suffix so the new card is unique within the
   * column. Returns the input unchanged if the column does not
   * exist. Mirrors the workbench `addCard` path for `type:
   * "project"` and the embedded `onProjectGroupAdd` callback.
   */
  static addProjectGroupData(
    data: DashboardData,
    columnName: string,
    title: string,
  ): DashboardData {
    const col = data.columns.find((c) => c.name === columnName);
    if (!col) return data;
    const newCard: DashboardCard = {
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
    };
    return SyncEngine.mapColumnData(data, columnName, (c) => ({
      ...c,
      cards: [...c.cards, newCard],
    }));
  }

  /**
   * Pure data-mutation helper for editing a single task's
   * `reminder` field. Returns the input unchanged when the card
   * or the task index is out of range. Used by both the
   * workbench `editTaskReminder` method and the embedded
   * `onTaskReminderEdit` callback.
   */
  static editTaskReminderData(
    data: DashboardData,
    cardId: string,
    taskIndex: number,
    reminder: string | undefined,
  ): DashboardData {
    // Empty string is normalised to `undefined` so the on-disk
    // representation of "no reminder" is consistent across both
    // views (and across a card that's been edited on both).
    const normalised = reminder || undefined;
    return SyncEngine.mapCardData(data, cardId, (card) => {
      if (taskIndex < 0 || taskIndex >= card.tasks.length) return card;
      return {
        ...card,
        tasks: card.tasks.map((t, i) =>
          i === taskIndex ? { ...t, reminder: normalised } : t,
        ),
      };
    });
  }

  /**
   * Pure data-mutation helper for replacing a card's `body` and
   * `blockquote` together (the memo-editor save path). Returns
   * the input unchanged when no card matches.
   */
  static updateMemoCardData(
    data: DashboardData,
    cardId: string,
    updates: { body: string; blockquote: string },
  ): DashboardData {
    return SyncEngine.patchCardData(data, cardId, updates);
  }

  /**
   * Pure data-mutation helper for replacing a card's `body` and
   * `projectDocs` (the project-editor "save all docs" path).
   * Always writes `body` in the canonical `- [[x]]` form so the
   * on-disk markdown round-trips correctly. Returns the input
   * unchanged when no card matches.
   */
  static updateProjectDocsData(
    data: DashboardData,
    cardId: string,
    docPaths: string[],
  ): DashboardData {
    const body = docPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
    return SyncEngine.patchCardData(data, cardId, { body });
  }

  /**
   * Pure data-mutation helper for reordering the top-level doc
   * lines in a project card's `body`. Both the workbench
   * `reorderDocPaths` method and the embedded
   * `onProjectDocsReorder` callback go through this. Operates on
   * `body` (the canonical source) and re-derives `projectDocs`
   * when the card carries one, so the structured array stays in
   * lockstep with the body.
   */
  static reorderDocPathsData(
    data: DashboardData,
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): DashboardData {
    return SyncEngine.mapCardData(data, cardId, (card) => {
      const paths = card.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- ") || l.startsWith("[["))
        .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
        .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
      if (fromIndex < 0 || fromIndex >= paths.length) return card;
      if (toIndex < 0) return card;
      const insertAt = Math.min(toIndex, paths.length - 1);
      const moved = paths[fromIndex]!;
      const newPaths = paths.filter((_, i) => i !== fromIndex);
      newPaths.splice(insertAt, 0, moved);
      const body = newPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
      return { ...card, body };
    });
  }

  /**
   * Pure data-mutation helper for moving a top-level doc line
   * from one project card to another. Operates on `body` and
   * returns a new data object with both the source card and the
   * destination card updated in lockstep. Returns the input
   * unchanged when the source / dest card is not found, the
   * source index is out of range, or the dest index is negative.
   */
  static moveDocToCardData(
    data: DashboardData,
    srcCardId: string,
    docIndex: number,
    destCardId: string,
    destIndex: number,
  ): DashboardData {
    if (destIndex < 0) return data;

    // Step 1: extract the moved path from the source card.
    let movedPath: string | null = null;
    const afterSrc = SyncEngine.mapCardData(data, srcCardId, (card) => {
      const paths = card.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- ") || l.startsWith("[["))
        .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
        .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
      if (docIndex < 0 || docIndex >= paths.length) return card;
      movedPath = paths[docIndex] ?? null;
      if (movedPath == null) return card;
      const newPaths = paths.filter((_, i) => i !== docIndex);
      const body = newPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
      return { ...card, body };
    });
    if (movedPath == null) return data;

    // Step 2: insert into the destination card.
    return SyncEngine.mapCardData(afterSrc, destCardId, (card) => {
      const paths = card.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- ") || l.startsWith("[["))
        .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
        .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
      const clamped = Math.min(destIndex, paths.length);
      paths.splice(clamped, 0, movedPath!);
      const body = paths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
      return { ...card, body };
    });
  }

  /**
   * Pure data-mutation helper for removing a top-level doc line
   * from a project card's `body`. Returns the input unchanged
   * when the index is out of range.
   */
  static removeProjectDocData(
    data: DashboardData,
    cardId: string,
    topIndex: number,
  ): DashboardData {
    return SyncEngine.mapCardData(data, cardId, (card) => {
      const paths = card.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- ") || l.startsWith("[["))
        .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
        .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
      if (topIndex < 0 || topIndex >= paths.length) return card;
      const newPaths = paths.filter((_, i) => i !== topIndex);
      const body = newPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
      return { ...card, body };
    });
  }

  /**
   * Pure data-mutation helper used by both the workbench and the
   * embedded dashboard view. Operates on the supplied `DashboardData`
   * and returns a NEW data object with the doc appended to the card
   * matching `cardId`. The caller is responsible for persisting the
   * result (workbench → `writeToDisk`; embedded → `saveEmbeddedAndRefresh`)
   * and re-rendering.
   *
   * The 3-way wrap rule and the append-not-replace behaviour are the
   * exact mirror of what `view.ts#onFileDrop` and the embedded
   * `onProjectDocsAdd` callback used to do inline — extracting them
   * here means there is now exactly ONE definition of "add a doc to
   * a card", so the embedded and workbench views can no longer drift
   * apart. This is the fix for "工作台和非工作台是两套逻辑" and
   * "添加到第三卡片会跑到第一卡片" (the previous two implementations
   * had a subtle divergence: the workbench checked for duplicates,
   * the embedded didn't, and the embedded mutated the card object
   * in-place — a recipe for stale-closure bugs when the data was
   * reloaded from disk between render and input).
   */
  static addDocToCardData(
    data: DashboardData,
    cardId: string,
    filePath: string,
  ): DashboardData {
    return {
      ...data,
      columns: data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          // Three-way wrap rule (mirrors view.ts onFileDrop):
          //   1. filePath already contains "[[" → use verbatim.
          //      Force-wrapping would produce nested brackets.
          //   2. filePath looks like a vault path (has "/" or ends
          //      with ".md") → wrap as `[[basename]]`.
          //   3. Anything else (plain text) → keep as a normal
          //      list line. The user typed it as plain text on
          //      purpose; force-wrapping into `[[11]]` would be
          //      wrong. This is the fix for "输入普通文本会变成
          //      双链笔记".
          const looksLikePath =
            filePath.includes("/") || filePath.toLowerCase().endsWith(".md");
          const newLine = filePath.includes("[[")
            ? `- ${filePath}`
            : looksLikePath
              ? `- ${pathToWikiLink(filePath)}`
              : `- ${filePath}`;
          if (
            card.body.includes(newLine) ||
            card.body.includes(pathToWikiLink(filePath).slice(0, -2) + "|")
          )
            return card;
          // Append as depth-0 entry in hierarchical format. Body
          // stores the already-wrapped render form so the on-disk
          // markdown round-trips correctly. The append (rather
          // than replace) is the fix for "拖拽双链笔记会直接替换
          // 普通文本" — prior versions overwrote the body and
          // silently dropped any earlier plain-text entries.
          const existingBody = card.body.trim();
          const body = existingBody ? `${existingBody}\n${newLine}` : newLine;
          // Mirror the new doc into projectDocs (if the card carries
          // one) so the structured-array stays in lockstep with
          // `body`. Without this, drag-reorder, re-render and
          // serialize all see a body that mentions a doc the
          // structured array does not know about — the canonical
          // source of the "添加会跑到别的卡片" symptom, because
          // the next reload from disk would round-trip `body` and
          // get a *different* (longer) projectDocs than the in-
          // memory copy, leaving the user's input in a weird limbo
          // where the UI shows it in the wrong card after reload.
          const projectDocs = Array.isArray(
            (card as { projectDocs?: unknown }).projectDocs,
          )
            ? [
                ...(card as { projectDocs: ProjectDocNode[] }).projectDocs,
                { path: filePath, children: [] } as ProjectDocNode,
              ]
            : card.projectDocs;
          return { ...card, body, projectDocs };
        }),
      })),
    };
  }

  async addDocToCard(cardId: string, filePath: string): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.addDocToCardData(this.data, cardId, filePath);
    await this.writeToDisk();
  }

  /**
   * Pure data-mutation helper for task toggling. Mirrors the
   * workbench `toggleTask` behaviour: a `checked: true` toggle
   * also moves the task to the end of the card's task list
   * (a long-standing "checked sinks to the bottom" UX rule).
   * Returns the input unchanged when the card or task index is
   * out of range.
   */
  static toggleTaskData(
    data: DashboardData,
    cardId: string,
    taskIndex: number,
    checked: boolean,
  ): DashboardData {
    return SyncEngine.mapCardData(data, cardId, (card) => {
      if (taskIndex < 0 || taskIndex >= card.tasks.length) return card;
      const newTasks: TaskItem[] = card.tasks.map((t, i) =>
        i === taskIndex ? { ...t, checked } : t,
      );
      if (checked) {
        const [moved] = newTasks.splice(taskIndex, 1);
        if (moved) newTasks.push(moved);
      }
      return { ...card, tasks: newTasks };
    });
  }

  /**
   * Pure data-mutation helper for task reorder within a single
   * card. Returns the input unchanged when the indices are out
   * of range or equal.
   */
  static reorderTaskData(
    data: DashboardData,
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): DashboardData {
    if (fromIndex === toIndex) return data;
    return SyncEngine.mapCardData(data, cardId, (card) => {
      if (fromIndex < 0 || fromIndex >= card.tasks.length) return card;
      if (toIndex < 0) return card;
      const tasks = [...card.tasks];
      const [moved] = tasks.splice(fromIndex, 1);
      if (!moved) return card;
      const insertAt = Math.min(toIndex, tasks.length);
      tasks.splice(insertAt, 0, moved);
      return { ...card, tasks };
    });
  }

  /**
   * Pure data-mutation helper for moving a task from one card to
   * another. Returns the input unchanged when the source / dest
   * card is missing, the source index is out of range, or the
   * dest index is negative.
   */
  static moveTaskToCardData(
    data: DashboardData,
    srcCardId: string,
    taskIndex: number,
    destCardId: string,
    destIndex: number,
  ): DashboardData {
    if (destIndex < 0) return data;
    let movedTask: TaskItem | null = null;
    const afterSrc = SyncEngine.mapCardData(data, srcCardId, (card) => {
      if (taskIndex < 0 || taskIndex >= card.tasks.length) return card;
      movedTask = card.tasks[taskIndex] ?? null;
      if (!movedTask) return card;
      return {
        ...card,
        tasks: card.tasks.filter((_, i) => i !== taskIndex),
      };
    });
    if (!movedTask) return data;
    return SyncEngine.mapCardData(afterSrc, destCardId, (card) => {
      const tasks = [...card.tasks];
      const clamped = Math.min(destIndex, tasks.length);
      tasks.splice(clamped, 0, movedTask!);
      return { ...card, tasks };
    });
  }

  /**
   * Pure data-mutation helper for editing a task's text. Returns
   * the input unchanged when the card or task index is out of
   * range, or `newText` is empty.
   */
  static editTaskData(
    data: DashboardData,
    cardId: string,
    taskIndex: number,
    newText: string,
  ): DashboardData {
    if (!newText) return data;
    return SyncEngine.mapCardData(data, cardId, (card) => {
      if (taskIndex < 0 || taskIndex >= card.tasks.length) return card;
      return {
        ...card,
        tasks: card.tasks.map((t, i) =>
          i === taskIndex ? { ...t, text: newText } : t,
        ),
      };
    });
  }

  /**
   * Pure data-mutation helper for adding a new task to a card.
   * Returns the input unchanged when `text` is empty after trim.
   * Used by both the workbench `addTask` method and the embedded
   * `onTaskAdd` callback.
   */
  static addTaskData(
    data: DashboardData,
    cardId: string,
    text: string,
  ): DashboardData {
    const trimmed = text.trim();
    if (!trimmed) return data;
    return SyncEngine.mapCardData(data, cardId, (card) => ({
      ...card,
      tasks: [...card.tasks, { text: trimmed, checked: false }],
    }));
  }

  /**
   * Pure data-mutation helper for deleting a task by index.
   * Returns the input unchanged when the card or task index is
   * out of range. Used by both the workbench `deleteTask` method
   * and the embedded `onTaskDelete` callback.
   */
  static deleteTaskData(
    data: DashboardData,
    cardId: string,
    taskIndex: number,
  ): DashboardData {
    return SyncEngine.mapCardData(data, cardId, (card) => {
      if (taskIndex < 0 || taskIndex >= card.tasks.length) return card;
      return {
        ...card,
        tasks: card.tasks.filter((_, i) => i !== taskIndex),
      };
    });
  }

  /**
   * Pure data-mutation helper for adding a new card to a column.
   * The new card starts as a generic, empty `type: "generic"` card
   * (the sectionType-specific defaults — todo/memo/migrate — live
   * on top of this in the workbench `addCard` method, but the
   * structural shape is owned here so both views start from the
   * same baseline).
   */
  static addCardData(
    data: DashboardData,
    columnName: string,
    overrides?: Partial<DashboardCard>,
  ): DashboardData {
    const baseCard: DashboardCard = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "",
      type: "generic",
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
      ...overrides,
    };
    return SyncEngine.mapColumnData(data, columnName, (col) => ({
      ...col,
      cards: [...col.cards, baseCard],
    }));
  }

  /**
   * Pure data-mutation helper for project-item reorder. Operates on
   * the supplied `DashboardData` and returns a NEW data object with
   * the item at `fromIndex` moved to `toIndex` in the card matching
   * `cardId`. The body AND the structured `projectDocs` array (when
   * present) are kept in lockstep. Returns the input data unchanged
   * if the indices are out of range or the card is not found.
   *
   * The embedded view used to re-implement this logic inline using
   * `projectDocs` indices + a manual `synthesizeProjectBodyFromDocs`
   * call. The two implementations had a subtle divergence on the
   * "insert at the end" bound: the workbench bailed out when
   * `toIndex >= length` (forbidding insertion at the end), the
   * embedded accepted `toIndex === length`. With body-based sections
   * + projectDocs mirror in one place, the rule is now uniform and
   * `toIndex === length` is allowed (matches the array splice
   * semantics and what the drag-and-drop UI naturally produces when
   * the user drops an item "past" the last existing item).
   */
  static reorderProjectItemData(
    data: DashboardData,
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): DashboardData {
    return {
      ...data,
      columns: data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          const sections = SyncEngine.splitProjectSections(card.body);
          if (fromIndex < 0 || fromIndex >= sections.length) return card;
          // Clamp `toIndex` to the post-splice length so that
          // "insert at the end" works (splice itself clamps but
          // we need the clamp value to keep projectDocs in sync).
          if (toIndex < 0) return card;
          const [moved] = sections.splice(fromIndex, 1);
          if (!moved) return card;
          const insertAt = Math.min(toIndex, sections.length);
          sections.splice(insertAt, 0, moved);
          const body = sections.join("\n");
          // Mirror the move into projectDocs (when the card
          // carries one) so the structured array stays in
          // lockstep with the canonical body.
          const projectDocs = Array.isArray(
            (card as { projectDocs?: unknown }).projectDocs,
          )
            ? (() => {
                const docs = [
                  ...(card as { projectDocs: ProjectDocNode[] }).projectDocs,
                ];
                if (fromIndex < 0 || fromIndex >= docs.length) return docs;
                const [m] = docs.splice(fromIndex, 1);
                if (!m) return docs;
                const ins = Math.min(toIndex, docs.length);
                docs.splice(ins, 0, m);
                return docs;
              })()
            : card.projectDocs;
          return { ...card, body, projectDocs };
        }),
      })),
    };
  }

  async reorderProjectItem(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.reorderProjectItemData(
      this.data,
      cardId,
      fromIndex,
      toIndex,
    );
    await this.writeToDisk();
  }

  /**
   * Pure data-mutation helper for moving a project item from one
   * card to another. Updates both the source card (removes the
   * item + its children) and the destination card (inserts the
   * item at the requested index). Returns the input data unchanged
   * if the source/dest card is not found, the source index is out
   * of range, or `destIndex` is negative.
   *
   * As with the other project helpers, body AND projectDocs are
   * updated together so the renderer and the serializer never see
   * a divergent view. This is the single definition of "move a
   * project item to another card" — the workbench and the embedded
   * view both go through it.
   */
  static moveProjectItemToCardData(
    data: DashboardData,
    srcCardId: string,
    itemIndex: number,
    destCardId: string,
    destIndex: number,
  ): DashboardData {
    // Step 1: find the source card and extract the moved section
    // + the moved projectDoc node (if any). We do a single pass
    // through the columns and return a tuple describing what was
    // extracted and the new (source-updated) data, so step 2
    // doesn't have to re-walk the columns to find the dest.
    let movedSection: string | null = null;
    let movedDoc: ProjectDocNode | null = null;
    let srcFound = false;

    const afterSrc = {
      ...data,
      columns: data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== srcCardId) return card;
          srcFound = true;
          const sections = SyncEngine.splitProjectSections(card.body);
          if (itemIndex < 0 || itemIndex >= sections.length) return card;
          movedSection = sections[itemIndex] ?? null;
          if (movedSection == null) return card;
          sections.splice(itemIndex, 1);
          // Mirror removal into projectDocs when the card carries
          // them. Capture the moved projectDoc node so we can
          // re-insert it into the destination.
          const existingDocs = (card as { projectDocs?: unknown }).projectDocs;
          if (Array.isArray(existingDocs)) {
            const docs = [...(existingDocs as ProjectDocNode[])];
            if (itemIndex >= 0 && itemIndex < docs.length) {
              const [extracted] = docs.splice(itemIndex, 1);
              if (extracted) movedDoc = extracted;
            }
            return { ...card, body: sections.join("\n"), projectDocs: docs };
          }
          return { ...card, body: sections.join("\n") };
        }),
      })),
    };

    if (!srcFound || movedSection == null) return data;
    if (destIndex < 0) return afterSrc;

    // Step 2: insert into the destination card. The dest card is
    // allowed to be the same as the source (in which case the
    // moved section has already been removed from sections and
    // needs to be re-inserted at the (already adjusted) destIndex).
    return {
      ...afterSrc,
      columns: afterSrc.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== destCardId) return card;
          const sections = SyncEngine.splitProjectSections(card.body);
          const insertAt = Math.min(destIndex, sections.length);
          sections.splice(insertAt, 0, movedSection!);
          const body = sections.join("\n");
          // Mirror insertion into projectDocs when the dest
          // card carries them. If the source extracted a
          // projectDoc node, we re-insert it; if not, the dest
          // projectDocs stays unchanged (some cards in workbench
          // mode do not carry a projectDocs array).
          if (movedDoc) {
            const existingDocs = (card as { projectDocs?: unknown })
              .projectDocs;
            const docs: ProjectDocNode[] = Array.isArray(existingDocs)
              ? (existingDocs as ProjectDocNode[]).map((d) => ({
                  path: d.path,
                  children: d.children ?? [],
                }))
              : [];
            const clamped = Math.min(destIndex, docs.length);
            docs.splice(clamped, 0, movedDoc);
            return { ...card, body, projectDocs: docs };
          }
          return { ...card, body };
        }),
      })),
    };
  }

  async moveProjectItemToCard(
    srcCardId: string,
    itemIndex: number,
    destCardId: string,
    destIndex: number,
  ): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.moveProjectItemToCardData(
      this.data,
      srcCardId,
      itemIndex,
      destCardId,
      destIndex,
    );
    await this.writeToDisk();
  }

  static splitProjectSections(body: string): string[] {
    if (!body.trim()) return [];
    const lines = body.split("\n");
    const sections: string[] = [];
    let current: string[] = [];

    for (const line of lines) {
      const depth = line.match(/^(\t*)/)?.[1]?.length ?? 0;
      if (depth === 0 && current.length > 0) {
        sections.push(current.join("\n"));
        current = [];
      }
      current.push(line);
    }
    if (current.length > 0) {
      sections.push(current.join("\n"));
    }
    return sections;
  }

  async removeProjectDoc(cardId: string, topIndex: number): Promise<void> {
    if (!this.data) return;
    this.data = SyncEngine.removeProjectDocData(this.data, cardId, topIndex);
    await this.writeToDisk();
  }

  /**
   * Pure data-mutation helper for removing a project item (the
   * line + its indented children) from a card's body. Updates
   * both `card.body` and `card.projectDocs` (when present) so the
   * two stay in lockstep. Returns a tuple of `{ data, removed }`
   * where `removed` is a snapshot the caller can use for undo
   * (the workbench pushes it onto the undo stack; the embedded
   * view simply discards it).
   *
   * The lookup is index-first (matches the renderer's titles[]
   * ordering) with a path-based fallback for stale indices — the
   * "delete the last item and it comes back" symptom happens when
   * the in-memory body and the rendered titles[] are out of sync
   * (e.g. body="" but projectDocs still has the entry), and the
   * fallback is what makes the user-visible delete always succeed.
   */
  static removeProjectItemData(
    data: DashboardData,
    cardId: string,
    itemIndex: number,
    itemPath?: string,
  ): {
    data: DashboardData;
    removed: {
      removedLines: string[];
      removedPath: string | undefined;
      removedProjectDocIdx: number;
    } | null;
  } {
    let removed: {
      removedLines: string[];
      removedPath: string | undefined;
      removedProjectDocIdx: number;
    } | null = null;

    const next: DashboardData = {
      ...data,
      columns: data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          const lines = (card.body ?? "").split("\n");

          // First pass: try to find the item by its index among
          // depth-0 lines (the fast path that matches the
          // renderer's titles[] ordering).
          let startIdx = -1;
          let topCount = 0;
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i] ?? "";
            if (!l.trim()) continue;
            const depth = l.match(/^(\t*)/)?.[1]?.length ?? 0;
            if (depth === 0) {
              if (topCount === itemIndex) {
                startIdx = i;
                break;
              }
              topCount++;
            }
          }

          // Fallback: if the index didn't resolve but we have a
          // path hint, search the body for a depth-0 line whose
          // wikilink text matches. This handles stale indices
          // and out-of-sync bodies so the user-visible delete
          // always succeeds.
          if (startIdx < 0 && itemPath) {
            const target = itemPath.trim();
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i] ?? "";
              if (!l.trim()) continue;
              const depth = l.match(/^(\t*)/)?.[1]?.length ?? 0;
              if (depth !== 0) continue;
              const m = l.replace(/^-+\s*/, "").match(/^\[\[([^\]|]+)/);
              if (m && m[1] && pathToWikiLink(m[1]).slice(2, -2) === target) {
                startIdx = i;
                break;
              }
            }
          }

          if (startIdx < 0) return card;
          let endIdx = startIdx + 1;
          while (endIdx < lines.length) {
            const l = lines[endIdx] ?? "";
            if (!l.trim()) {
              endIdx++;
              continue;
            }
            const depth = l.match(/^(\t*)/)?.[1]?.length ?? 0;
            if (depth === 0) break;
            endIdx++;
          }
          // Capture the wikilink path of the line we are about
          // to remove so we can mirror the deletion into
          // projectDocs. Without this, an in-memory projectDocs
          // array can resurrect the item on the next render
          // (when card.body is empty, the renderer falls back
          // to projectDocs as the source of truth). This was
          // the "delete the last item and it comes back"
          // symptom.
          const removedPath = (() => {
            const raw = (lines[startIdx] ?? "").replace(/^\t+/, "");
            const m = raw.replace(/^-+\s*/, "").match(/^\[\[([^\]|]+)/);
            if (!m || !m[1]) return undefined;
            return pathToWikiLink(m[1]).slice(2, -2);
          })();
          // Snapshot the lines (and any indented children)
          // BEFORE the splice so the caller (workbench) can
          // push an undo entry.
          const removedLines = lines.slice(startIdx, endIdx);
          lines.splice(startIdx, endIdx - startIdx);
          // Normalize: drop any trailing empty lines that the
          // splice may have introduced so the body stays
          // compact.
          while (lines.length > 0 && !lines[lines.length - 1]!.trim()) {
            lines.pop();
          }
          const body = lines.join("\n");

          // Mirror the removal into projectDocs so the two data
          // sources stay in sync. We try the captured wikilink
          // path first, then fall back to the index-based
          // position.
          type DocEntry = { path: string; children?: unknown[] } | string;
          let nextProjectDocs: DocEntry[] | undefined = (
            card as { projectDocs?: DocEntry[] }
          ).projectDocs;
          let removedProjectDocIdx = -1;
          if (Array.isArray(nextProjectDocs) && nextProjectDocs.length > 0) {
            let dropIdx = -1;
            if (removedPath) {
              const target = removedPath.trim();
              dropIdx = nextProjectDocs.findIndex((d) => {
                const p = typeof d === "string" ? d : d?.path;
                return (
                  typeof p === "string" &&
                  pathToWikiLink(p).slice(2, -2) === target
                );
              });
            }
            if (
              dropIdx < 0 &&
              itemIndex >= 0 &&
              itemIndex < nextProjectDocs.length
            ) {
              dropIdx = itemIndex;
            }
            if (dropIdx >= 0) {
              removedProjectDocIdx = dropIdx;
              nextProjectDocs = nextProjectDocs.filter((_, i) => i !== dropIdx);
            }
          }
          removed = {
            removedLines,
            removedPath,
            removedProjectDocIdx,
          };

          // Normalize projectDocs back to ProjectDocNode[] (the
          // shape DashboardCard expects). If the source array
          // held plain strings we promote them, matching the
          // other sync helpers (addDocToCard etc.) which always
          // store {path, children}.
          const normalizedProjectDocs:
            | import("./types").ProjectDocNode[]
            | undefined = Array.isArray(nextProjectDocs)
            ? nextProjectDocs.map((d) => ({
                path: typeof d === "string" ? d : d.path,
                children: [],
              }))
            : undefined;

          return {
            ...card,
            body,
            ...(normalizedProjectDocs
              ? { projectDocs: normalizedProjectDocs }
              : {}),
          };
        }),
      })),
    };
    return { data: next, removed };
  }

  async removeProjectItem(
    cardId: string,
    itemIndex: number,
    itemPath?: string,
  ): Promise<void> {
    if (!this.data) return;
    const { data, removed } = SyncEngine.removeProjectItemData(
      this.data,
      cardId,
      itemIndex,
      itemPath,
    );
    this.data = data;
    if (removed) {
      this.pushUndo({
        kind: "projectItem",
        cardId,
        itemPath,
        removedLines: removed.removedLines,
        removedPath: removed.removedPath,
        removedProjectDocIdx: removed.removedProjectDocIdx,
      });
    }
    await this.writeToDisk();
  }

  async addFileLinkToMemo(cardId: string, filePath: string): Promise<void> {
    if (!this.data) return;
    // v1.4.10 — funnel through the unified `addFileLinkData`
    // helper so memo file links go through the same code path
    // as the embedded view (and the in-workbench file-drop on
    // a memo card). The helper picks the right format based on
    // the card's sectionType / cardType.
    this.data = SyncEngine.addFileLinkData(
      this.data,
      cardId,
      filePath,
      "memo",
      "memo",
    );
    await this.writeToDisk();
  }

  async updateMemoColor(cardId: string, color: string): Promise<void> {
    await this.updateCard(cardId, { color });
  }

  async updateCardWidth(cardId: string, width: number): Promise<void> {
    await this.updateCard(cardId, { width });
  }

  async updateCardSize(
    cardId: string,
    size: import("./types").CardSize,
  ): Promise<void> {
    await this.updateCard(cardId, { size });
  }

  async updateCardHideCompleted(
    cardId: string,
    hideCompleted: boolean,
  ): Promise<void> {
    if (!this.data) return;
    this.hideCompletedOverrides.set(cardId, hideCompleted);
    this.data = SyncEngine.patchCardData(this.data, cardId, {
      hideCompleted,
    });
    this.notifyCallbacks();
  }

  async updateCardGrid(
    cardId: string,
    gridCols: number,
    gridRows: number,
  ): Promise<void> {
    await this.updateCard(cardId, { gridCols, gridRows });
  }

  async updateCardGridMove(
    cardId: string,
    gridCol: number,
    gridRow: number,
  ): Promise<void> {
    await this.updateCard(cardId, { gridCol, gridRow });
  }

  async updateProjectCover(cardId: string, coverImage: string): Promise<void> {
    await this.updateCard(cardId, { coverImage });
  }

  async replaceData(newData: DashboardData): Promise<void> {
    this.data = newData;
    await this.writeToDisk();
  }

  private getDefaultCardTitle(
    columnName: string,
    sectionType?: string,
  ): string {
    const effective = sectionType?.toLowerCase();
    if (
      effective === "memo" ||
      (!effective && columnName.toLowerCase() === "memo")
    ) {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return t("sync.memoTitle", { date });
    }
    if (
      effective === "todo" ||
      (!effective && columnName.toLowerCase() === "todo")
    )
      return t("sync.todoTitle");
    if (effective === "notes") return t("sync.notesTitle");
    if (columnName.toLowerCase() === "projects") return t("sync.projectTitle");
    return t("sync.newCard");
  }

  private getDefaultCardType(
    columnName: string,
    sectionType?: string,
  ): CardType {
    const effective = sectionType?.toLowerCase();
    if (
      effective === "todo" ||
      (!effective && columnName.toLowerCase() === "todo")
    )
      return "task";
    if (
      effective === "memo" ||
      (!effective && columnName.toLowerCase() === "memo")
    )
      return "generic";
    if (
      effective === "dashboard" ||
      (!effective && columnName.toLowerCase() === "dashboard")
    )
      return "weather";
    return "project";
  }

  private async findOrCreateFile(): Promise<void> {
    const rawPath = this.settings.dashboardFile.trim();
    const path = rawPath.endsWith(".md") ? rawPath : `${rawPath}.md`;
    const existing = this.app.vault.getFileByPath(path);
    if (existing) {
      this.file = existing;
      return;
    }

    const content = generateEmptyDashboardMarkdown();
    this.file = await this.app.vault.create(path, content);
  }

  private deferredWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private renameEventRef: ReturnType<typeof this.app.vault.on> | null = null;

  private registerFileWatcher(): void {
    const filePath = this.file?.path;
    this.eventRef = this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path === filePath) {
        this.onFileModify();
      }
    });

    this.renameEventRef = this.app.vault.on(
      "rename",
      (file: TFile, oldPath: string) => {
        if (!this.data) return;
        this.handleFileRename(file, oldPath);
      },
    );
  }

  private handleFileRename(file: TFile, oldPath: string): void {
    if (!this.data) return;
    const newPath = file.path;
    let changed = false;

    const replace = (str: string): string => {
      if (!str || !str.includes(oldPath)) return str;
      changed = true;
      return str.split(oldPath).join(newPath);
    };

    const oldPathNoExt = oldPath.endsWith(".md")
      ? oldPath.slice(0, -3)
      : oldPath;
    const newName = file.basename;

    const quickActions = this.data.quickActions.map((action) => {
      if (action.type !== "file") return action;
      if (action.target !== oldPath && action.target !== oldPathNoExt)
        return action;
      changed = true;
      return { ...action, target: newPath, name: newName };
    });

    const banner = {
      ...this.data.banner,
      image: replace(this.data.banner.image),
    };

    const columns = this.data.columns.map((col) => ({
      ...col,
      cards: col.cards.map((card) => ({
        ...card,
        coverImage: replace(card.coverImage),
      })),
    }));

    if (!changed) return;

    // Cancel pending re-parse to prevent race condition
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.data = { ...this.data, banner, quickActions, columns };
    this.writeToDisk();
  }

  private scheduleDeferredWrite(): void {
    if (this.deferredWriteTimer) clearTimeout(this.deferredWriteTimer);
    this.deferredWriteTimer = setTimeout(() => {
      this.deferredWriteTimer = null;
      if (this.data) {
        this.writeToDisk();
      }
    }, 1000);
  }

  private onFileModify(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.load();
    }, this.debounceMs);
  }

  private async load(): Promise<void> {
    if (!this.file) {
      console.warn("[apex-dashboard] load called with no file");
      return;
    }

    try {
      const content = await this.app.vault.read(this.file);
      const hash = simpleHash(content);
      if (hash === this.lastWrittenHash) return;

      this.data = this.applySessionOverrides(parse(content));
      this.notifyCallbacks();
    } catch (err) {
      console.error(
        "[apex-dashboard] Failed to load dashboard file:",
        this.file.path,
        err,
      );
      new Notice(t("error.saveFailed") || "Failed to load dashboard data");
    }
  }

  private applySessionOverrides(data: DashboardData): DashboardData {
    if (this.hideCompletedOverrides.size === 0) return data;
    const present = new Set<string>();
    const columns = data.columns.map((col) => ({
      ...col,
      cards: col.cards.map((card) => {
        present.add(card.id);
        const override = this.hideCompletedOverrides.get(card.id);
        if (override === undefined) return card;
        return { ...card, hideCompleted: override };
      }),
    }));
    for (const key of this.hideCompletedOverrides.keys()) {
      if (!present.has(key)) this.hideCompletedOverrides.delete(key);
    }
    return { ...data, columns };
  }

  /**
   * v1.4.9 BUG-003c — column-level frontmatter write path.
   *
   * Calls `app.fileManager.processFrontMatter(file, mutate)` so the
   * plugin only touches the frontmatter key the caller specifies —
   * banner, quickActions, extra frontmatter, and YAML comment lines
   * stay byte-identical on disk. This is the official Obsidian API
   * for "mutate one frontmatter key without rewriting the whole
   * file" and avoids the heavyweight `serializeInto` + `vault.modify`
   * round-trip we use for full-file writes.
   *
   * Behaviour:
   *   1. The `mutate` callback is invoked with the live frontmatter
   *      object; whatever fields it mutates get persisted.
   *   2. After Obsidian writes the file, we re-parse the new contents
   *      and refresh `this.data` so in-memory state (including
   *      `extraFrontmatter`) matches the post-write file.
   *   3. Callers MUST update `this.data` themselves BEFORE invoking
   *      this — `updateColumnsField` does that for them.
   *   4. We do NOT call `writeToDisk`, so the banner size-protection
   *      guard (which is only meaningful for the full-file path) is
   *      not triggered.
   */
  private async updateFrontmatterField(
    file: TFile,
    mutate: (fm: Record<string, unknown>) => void,
  ): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        mutate(fm as Record<string, unknown>);
      });
      // Re-parse the file so this.data reflects the on-disk truth
      // (any side-effects of processFrontMatter on other keys, plus
      // a fresh `extraFrontmatter` snapshot, are picked up here).
      const updated = await this.app.vault.read(file);
      const parsed = parse(updated);
      // Preserve the in-memory column objects the caller just
      // mutated — `parse` rebuilds them from scratch and would
      // drop the sectionType / archiveCompleted edit. We restore
      // those from `this.data` so the live state survives the
      // round-trip.
      this.data = this.applySessionOverrides(this.mergeColumnState(parsed));
    } catch (e) {
      console.error("[apex-dashboard] processFrontMatter failed", e);
      new (await import("obsidian")).Notice(
        t("error.saveFailed") || "Failed to save dashboard changes",
      );
    }
  }

  /**
   * v1.4.9 BUG-003a — fix #2 path: the view computes the next
   * `DashboardData` (with the new sectionType baked in) and hands
   * it to us. We:
   *   1. adopt it as `this.data` synchronously, so any subsequent
   *      `getData()` / `notifyCallbacks` returns the new state
   *   2. fire `notifyCallbacks` so listeners (e.g. a sync-managed
   *      re-render) see the new state immediately
   *   3. persist ONLY the `columns:` block via `processFrontMatter`,
   *      leaving banner / quickActions / extra frontmatter / YAML
   *      comments byte-identical on disk
   *
   * This is the path that fixes the "styles refresh, data does
   * not" symptom: the view renders with the same object reference
   * it built the next-data from, so there is no opportunity for a
   * stale snapshot to leak back into the render pipeline.
   */
  async persistColumnMutation(nextData: DashboardData): Promise<void> {
    if (!this.file) return;
    if (this.data) {
      this.data = nextData;
    }
    this.notifyCallbacks();
    const fmColumns = nextData.columns.map((col) =>
      this.columnToFrontmatter(col),
    );
    await this.updateFrontmatterField(this.file, (fm) => {
      fm.columns = fmColumns;
    });
  }

  /**
   * v1.4.9 BUG-003c — public wrapper that updates ONLY the `columns`
   * frontmatter field. Use this for sectionType / archiveCompleted
   * edits where banner / quickActions / extra frontmatter must be
   * left alone.
   *
   * The `updater` receives the current in-memory columns and returns
   * the new column array. The returned array is:
   *   1. assigned to `this.data.columns` synchronously (so the view
   *      can re-render against the new state in the same tick)
   *   2. serialised into the file's `columns:` block via
   *      `processFrontMatter`
   *   3. followed by `notifyCallbacks` to push the new data to the
   *      view (this is what fixes BUG-003a: previously, the
   *      vault 'modify' listener refreshed only library sections
   *      and the dashboard view never got a re-render signal).
   */
  async updateColumnsField(
    updater: (cols: DashboardColumn[]) => DashboardColumn[],
  ): Promise<void> {
    if (!this.data || !this.file) return;

    const nextColumns = updater(this.data.columns);
    this.data = {
      ...this.data,
      columns: nextColumns,
    };
    this.notifyCallbacks();
    // Build a YAML-shaped array of plain objects matching the
    // frontmatter schema. We do NOT go through `serialize` here —
    // processFrontMatter accepts a JS object directly and the YAML
    // library Obsidian uses (js-yaml) will dump it.
    const fmColumns = nextColumns.map((col) => this.columnToFrontmatter(col));

    await this.updateFrontmatterField(this.file, (fm) => {
      fm.columns = fmColumns;
    });
  }

  /**
   * v1.4.9 helper — convert a `DashboardColumn` to the plain-object
   * shape that processFrontMatter expects inside `fm.columns`. We
   * deliberately emit only the keys the user-facing parser writes
   * (name / type / archiveCompleted / library) and let js-yaml handle
   * the YAML serialisation — this way we never accidentally re-emit
   * `cards` or other non-frontmatter fields into the YAML block.
   */
  private columnToFrontmatter(col: DashboardColumn): Record<string, unknown> {
    const out: Record<string, unknown> = {
      name: col.name,
    };
    if (col.sectionType) out.type = col.sectionType;
    if (col.archiveCompleted !== undefined) {
      out.archiveCompleted = col.archiveCompleted;
    }
    if (col.libraryConfig) {
      const lc = col.libraryConfig;
      // Every library config field is serialised *unconditionally* so
      // the user can hand-edit the file and see all available keys.
      // Length-zero arrays are still written — the parser treats
      // "field absent" and "field = []" the same way, so round-trip
      // is safe in both directions, and the user gets a stable
      // surface area in the frontmatter.
      const libOut: Record<string, unknown> = {
        viewMode: lc.viewMode,
        sortBy: lc.sortBy,
        sortDesc: lc.sortDesc,
        // Always serialise the filters array. When the user clears
        // every filter, we still write `filters: []` so a hand-edit
        // can replace it with `filters: [{ property: "Type",
        // values: ["A", "B"] }]` and the value is honoured on the
        // next reload. Without this, the field would be silently
        // dropped on save and the user would see "all files" even
        // though their filter looked like it was still in the file.
        filters: lc.filters.map((f) => {
          const fo: Record<string, unknown> = {
            property: f.property,
            values: f.values,
          };
          if (f.dateRange) {
            if (f.dateRange.start) fo.dateStart = f.dateRange.start;
            if (f.dateRange.end) fo.dateEnd = f.dateRange.end;
          }
          return fo;
        }),
        // Always serialise visibleProperties. Same rationale as
        // filters: the field is meaningful in YAML and the user
        // should be able to add/remove keys by hand.
        visibleProperties: lc.visibleProperties ?? [],
        // Page size and sort/group options are also kept stable.
        pageSize: lc.pageSize ?? 20,
        kanbanGroupBy: lc.kanbanGroupBy ?? "",
      };
      // quickDateFilter is treated as "active" when the user has
      // actually typed a start or end date — when both are empty we
      // drop the field entirely so the frontmatter only shows
      // config the user explicitly engaged with. The parser still
      // accepts a hand-written quickDateFilter block on reload, so
      // round-trip is preserved when the user actually sets it.
      if (
        lc.quickDateFilter &&
        (lc.quickDateFilter.start || lc.quickDateFilter.end)
      ) {
        libOut.quickDateFilter = {
          property: lc.quickDateFilter.property,
          start: lc.quickDateFilter.start,
          end: lc.quickDateFilter.end,
        };
      }
      out.library = libOut;
    }
    return out;
  }

  /**
   * v1.4.9 helper — re-apply the current `this.data.columns` state
   * over the freshly-parsed columns coming from disk. processFrontMatter
   * writes the YAML, but the in-memory columns we just updated
   * (sectionType / archiveCompleted) are otherwise lost in the
   * re-parse round-trip.
   */
  private mergeColumnState(parsed: DashboardData): DashboardData {
    if (!this.data) return parsed;
    const byName = new Map(this.data.columns.map((c) => [c.name, c]));
    const merged = parsed.columns.map((parsedCol) => {
      const live = byName.get(parsedCol.name);
      if (!live) return parsedCol;
      return {
        ...parsedCol,
        sectionType: live.sectionType,
        archiveCompleted: live.archiveCompleted,
      };
    });
    return { ...parsed, columns: merged };
  }

  private async writeToDisk(): Promise<void> {
    if (!this.data) {
      console.warn(
        "[apex-dashboard] writeToDisk called with no data, skipping save",
      );
      return;
    }
    if (!this.file) {
      console.warn(
        "[apex-dashboard] writeToDisk called with no file, skipping save",
      );
      new Notice(
        t("error.saveFailed") || "Failed to save dashboard: file not found",
      );
      return;
    }

    const fileRef = this.file;
    const dataSnapshot = this.data;

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const current = await this.app.vault.read(fileRef);
        const content = serializeInto(current, dataSnapshot);
        const hash = simpleHash(content);

        // Skip if identical content (no actual change)
        if (hash === this.lastWrittenHash) {
          return;
        }

        const newBannerLen = extractBannerSectionLength(content);
        const currentBannerLen = extractBannerSectionLength(current);

        // Only block write if banner is drastically smaller AND user had a dataURL banner
        // (base64 dataURLs are much longer than normal image URLs)
        const currentHasDataUrlBanner =
          current.includes("banner:") &&
          (current.includes("data:image") || currentBannerLen > 500);
        if (currentHasDataUrlBanner && newBannerLen < currentBannerLen * 0.3) {
          console.warn(
            "[apex-dashboard] Banner safety guard triggered: banner length would drop from",
            currentBannerLen,
            "to",
            newBannerLen,
          );
          new Notice(
            t("error.saveFailed") ||
              "Save blocked: banner image data would be lost. If you want to remove the banner, please do so from banner settings.",
          );
          return;
        }

        await this.app.vault.modify(fileRef, content);
        this.lastWrittenHash = hash;
      } catch (err) {
        console.error("[apex-dashboard] Failed to write dashboard file:", err);
        new Notice(t("error.saveFailed") || "Failed to save dashboard changes");
      }
    });

    this.notifyCallbacks();
  }

  private notifyCallbacks(): void {
    if (!this.data) return;
    for (const cb of this.callbacks) {
      cb(this.data);
    }
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Extract the byte-length of the "banner:" YAML block of a serialized
 * dashboard markdown file. The block starts at the first "banner:" token
 * and ends at the next top-level "---" or "columns:" marker (whichever
 * comes first). This is used by writeToDisk() to verify that the banner
 * image data (base64 dataURL) survives a write without depending on the
 * total file size — letting legitimate user deletions (e.g. removing the
 * last project item) shrink the body freely while still guarding against
 * accidentally wiping out the banner image.
 */
function extractBannerSectionLength(content: string): number {
  const start = content.indexOf("\nbanner:");
  const bannerStart = start >= 0 ? start + 1 : content.indexOf("banner:");
  if (bannerStart < 0) return 0;
  // Find the first top-level marker after banner — either "---" on its
  // own line, or "columns:" (also top-level). YAML "image:" lines begin
  // with two spaces, so they do not match.
  const rest = content.slice(bannerStart);
  const endMatch = rest.match(/\n---\n|\ncolumns:/);
  if (!endMatch || endMatch.index === undefined) return rest.length;
  return endMatch.index;
}
