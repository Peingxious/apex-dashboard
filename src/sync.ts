import { App, TFile } from "obsidian";
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
  generateDefaultMarkdown,
  pathToWikiLink,
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
  private static readonly BACKUP_DIR = ".dashboard-backup";
  private static readonly MAX_BACKUPS = 5;
  /** Stack of in-memory undo entries for the most recent destructive ops. */
  private undoStack: UndoEntry[] = [];
  private static readonly MAX_UNDO = 50;

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

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          if (taskIndex >= card.tasks.length) return card;
          const newTasks: TaskItem[] = card.tasks.map((t, i) =>
            i === taskIndex ? { ...t, checked } : t,
          );
          if (checked) {
            const [moved] = newTasks.splice(taskIndex, 1);
            newTasks.push(moved!);
          }
          return { ...card, tasks: newTasks };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async reorderTask(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          if (fromIndex < 0 || fromIndex >= card.tasks.length) return card;
          if (toIndex < 0 || toIndex >= card.tasks.length) return card;
          const tasks = [...card.tasks];
          const moved = tasks[fromIndex]!;
          tasks.splice(fromIndex, 1);
          tasks.splice(toIndex, 0, moved);
          return { ...card, tasks };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async moveTaskToCard(
    srcCardId: string,
    taskIndex: number,
    destCardId: string,
    destIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    let movedTask: TaskItem | undefined;

    const columnsWithout = this.data.columns.map((col) => ({
      ...col,
      cards: col.cards.map((card) => {
        if (card.id !== srcCardId) return card;
        if (taskIndex < 0 || taskIndex >= card.tasks.length) return card;
        movedTask = card.tasks[taskIndex];
        return { ...card, tasks: card.tasks.filter((_, i) => i !== taskIndex) };
      }),
    }));

    if (!movedTask) return;

    this.data = {
      ...this.data,
      columns: columnsWithout.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== destCardId) return card;
          const tasks = [...card.tasks];
          const clamped = Math.min(destIndex, tasks.length);
          tasks.splice(clamped, 0, movedTask!);
          return { ...card, tasks };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async editTask(
    cardId: string,
    taskIndex: number,
    newText: string,
  ): Promise<void> {
    if (!this.data || !newText) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          if (taskIndex >= card.tasks.length) return card;
          const tasks = card.tasks.map((t, i) =>
            i === taskIndex ? { ...t, text: newText } : t,
          );
          return { ...card, tasks };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async addTask(cardId: string, text: string): Promise<void> {
    if (!this.data || !text.trim()) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          return {
            ...card,
            tasks: [...card.tasks, { text: text.trim(), checked: false }],
          };
        }),
      })),
    };
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

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          if (taskIndex >= card.tasks.length) return card;
          const newTasks = card.tasks.filter((_, i) => i !== taskIndex);
          return { ...card, tasks: newTasks };
        }),
      })),
    };
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

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) =>
          card.id === cardId ? { ...card, ...updates } : card,
        ),
      })),
    };
    await this.writeToDisk();
  }

  async editTaskReminder(
    cardId: string,
    taskIndex: number,
    reminder: string | undefined,
  ): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          if (taskIndex >= card.tasks.length) return card;
          const tasks = card.tasks.map((t, i) =>
            i === taskIndex ? { ...t, reminder } : t,
          );
          return { ...card, tasks };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async deleteCard(cardId: string): Promise<void> {
    if (!this.data) return;

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

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.filter((c) => c.id !== cardId),
      })),
    };
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

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) =>
        col.name === columnName
          ? { ...col, cards: [...col.cards, newCard] }
          : col,
      ),
    };
    await this.writeToDisk();
  }

  async addColumn(name: string, sectionType?: string): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: [
        ...this.data.columns,
        { name, color: "#6366f1", sectionType, cards: [] },
      ],
    };
    await this.writeToDisk();
  }

  async updateLibraryConfig(
    columnName: string,
    config: import("./types").LibraryConfig,
  ): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) =>
        col.name === columnName ? { ...col, libraryConfig: config } : col,
      ),
    };
    await this.writeToDisk();
  }

  async renameColumn(oldName: string, newName: string): Promise<void> {
    if (!this.data || !newName || oldName === newName) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) =>
        col.name === oldName ? { ...col, name: newName } : col,
      ),
    };
    await this.writeToDisk();
  }

  async setColumnSectionType(
    columnName: string,
    sectionType: string,
  ): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) =>
        col.name === columnName ? { ...col, sectionType } : col,
      ),
    };
    await this.writeToDisk();
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

    this.data = {
      ...this.data,
      columns: this.data.columns.filter((col) => col.name !== name),
    };
    await this.writeToDisk();
  }

  async moveCard(
    cardId: string,
    targetColumn: string,
    targetIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    let movedCard: DashboardCard | null = null;

    const columnsWithout = this.data.columns.map((col) => {
      const idx = col.cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        movedCard = { ...col.cards[idx]!, column: targetColumn };
        return {
          ...col,
          cards: [...col.cards.slice(0, idx), ...col.cards.slice(idx + 1)],
        };
      }
      return col;
    });

    if (!movedCard) return;

    const newColumns = columnsWithout.map((col) => {
      if (col.name !== targetColumn) return col;
      const cards = [...col.cards];
      cards.splice(targetIndex, 0, movedCard!);
      return { ...col, cards };
    });

    this.data = { ...this.data, columns: newColumns };
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

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) =>
          card.id === cardId ? { ...card, ...updates } : card,
        ),
      })),
    };
    await this.writeToDisk();
  }

  async reorderDocPaths(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          const paths = card.body
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("- ") || l.startsWith("[["))
            .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
            .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
          if (fromIndex < 0 || fromIndex >= paths.length) return card;
          if (toIndex < 0 || toIndex >= paths.length) return card;
          const moved = paths[fromIndex]!;
          paths.splice(fromIndex, 1);
          paths.splice(toIndex, 0, moved);
          // Always write back in the canonical "- [[x]]" form.
          const body = paths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
          return { ...card, body };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async moveDocToCard(
    srcCardId: string,
    docIndex: number,
    destCardId: string,
    destIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    let movedDocPath: string | undefined;

    const columnsWithout = this.data.columns.map((col) => ({
      ...col,
      cards: col.cards.map((card) => {
        if (card.id !== srcCardId) return card;
        const paths = card.body
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("- ") || l.startsWith("[["))
          .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
          .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
        if (docIndex < 0 || docIndex >= paths.length) return card;
        movedDocPath = paths[docIndex];
        const newPaths = paths.filter((_, i) => i !== docIndex);
        // Always write back in the canonical "- [[x]]" form so the
        // body format stays consistent across all mutators.
        const body = newPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
        return { ...card, body };
      }),
    }));

    if (!movedDocPath) return;

    this.data = {
      ...this.data,
      columns: columnsWithout.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== destCardId) return card;
          const paths = card.body
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("- ") || l.startsWith("[["))
            .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
            .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
          const clamped = Math.min(destIndex, paths.length);
          paths.splice(clamped, 0, movedDocPath!);
          const body = paths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
          return { ...card, body };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async updateProjectDocs(cardId: string, docPaths: string[]): Promise<void> {
    if (!this.data) return;

    // Always write back in the canonical "- [[x]]" form.
    const body = docPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) =>
          card.id === cardId ? { ...card, body } : card,
        ),
      })),
    };
    await this.writeToDisk();
  }

  async addDocToCard(cardId: string, filePath: string): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
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
          return { ...card, body };
        }),
      })),
    };
    await this.writeToDisk();
  }

  private splitProjectSections(body: string): string[] {
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

  async reorderProjectItem(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          const sections = this.splitProjectSections(card.body);
          if (fromIndex < 0 || fromIndex >= sections.length) return card;
          if (toIndex < 0 || toIndex >= sections.length) return card;
          const [moved] = sections.splice(fromIndex, 1);
          sections.splice(toIndex, 0, moved!);
          return { ...card, body: sections.join("\n") };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async moveProjectItemToCard(
    srcCardId: string,
    itemIndex: number,
    destCardId: string,
    destIndex: number,
  ): Promise<void> {
    if (!this.data) return;

    let movedSection = "";
    // Track the moved projectDoc node (if any) so we can mirror the
    // move into the structured projectDocs array on the dest card.
    // Without this, dragging the last item out of a card leaves
    // body="" while projectDocs still references the moved item.
    // The serializer would then fall back to projectDocs synthesis
    // and crash on ".includes is not a function" for ProjectDocNode
    // children.
    let movedDoc: import("./types").ProjectDocNode | undefined;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== srcCardId) return card;
          const sections = this.splitProjectSections(card.body);
          if (itemIndex < 0 || itemIndex >= sections.length) return card;
          movedSection = sections[itemIndex]!;
          sections.splice(itemIndex, 1);

          // Mirror the removal into projectDocs (if the card
          // carries them) so the two data sources stay in lockstep.
          const existingDocs = (card as { projectDocs?: unknown })
            .projectDocs;
          if (Array.isArray(existingDocs)) {
            const docs = existingDocs as import("./types").ProjectDocNode[];
            if (itemIndex >= 0 && itemIndex < docs.length) {
              const [extracted] = docs.splice(itemIndex, 1);
              if (extracted) movedDoc = extracted;
            }
          }

          return { ...card, body: sections.join("\n") };
        }),
      })),
    };

    if (!movedSection) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== destCardId) return card;
          const sections = this.splitProjectSections(card.body);
          const insertIdx = Math.min(destIndex, sections.length);
          sections.splice(insertIdx, 0, movedSection);

          // Mirror the insertion into projectDocs (if the dest
          // card carries them) so renderer + serializer stay in
          // sync with body.
          if (movedDoc) {
            const existingDocs = (card as { projectDocs?: unknown })
              .projectDocs;
            const docs: import("./types").ProjectDocNode[] = Array.isArray(
              existingDocs,
            )
              ? (existingDocs as import("./types").ProjectDocNode[]).map((d) => ({
                  path: d.path,
                  children: d.children ?? [],
                }))
              : [];
            const clamped = Math.min(destIndex, docs.length);
            docs.splice(clamped, 0, movedDoc);
            return { ...card, body: sections.join("\n"), projectDocs: docs };
          }

          return { ...card, body: sections.join("\n") };
        }),
      })),
    };
    await this.writeToDisk();
  }

  async removeProjectDoc(cardId: string, topIndex: number): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          // Accept both "- [[x]]" and bare "[[x]]" body formats.
          const paths = card.body
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("- ") || l.startsWith("[["))
            .map((l) => (l.startsWith("- ") ? l.slice(2) : l))
            .map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, ""));
          if (topIndex < 0 || topIndex >= paths.length) return card;
          const newPaths = paths.filter((_, i) => i !== topIndex);
          // Normalize through pathToWikiLink so any hand-written path
          // (e.g. [[folder/note.md]]) is collapsed to basename form,
          // and always write back in the canonical "- [[x]]" form.
          const body = newPaths.map((p) => `- ${pathToWikiLink(p)}`).join("\n");
          return { ...card, body };
        }),
      })),
    };
    await this.writeToDisk();
  }

  /**
   * Remove a top-level project item (the line + its indented children) from
   * a card's body. Used by the dashboard project's per-item delete button.
   *
   * The caller passes `itemIndex` (0-based index among the depth-0 lines)
   * and optionally `itemPath` — the wikilink target text of the item to
   * delete. If `itemPath` is provided and the index-based lookup fails
   * (e.g. because the index is stale or the body format is unexpected),
   * we fall back to finding the first depth-0 line whose wikilink text
   * matches `itemPath`. This prevents the "delete the last item and it
   * comes back" symptom when the in-memory card.body and the rendered
   * titles[] are out of sync.
   */
  async removeProjectItem(
    cardId: string,
    itemIndex: number,
    itemPath?: string,
  ): Promise<void> {
    if (!this.data) return;

    // Undo snapshot: captured inside the .map() below and pushed to
    // the undo stack right before writeToDisk() so Ctrl+Z can
    // re-insert the removed lines + projectDoc entry verbatim.
    let undoSnapshot: Extract<UndoEntry, { kind: "projectItem" }> | null = null;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          const lines = (card.body ?? "").split("\n");

          // First pass: try to find the item by its index among
          // depth-0 lines (the fast path that matches the renderer's
          // titles[] ordering).
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

          // Fallback: if the index didn't resolve but we have a path
          // hint, search the body for a depth-0 line whose wikilink
          // text matches. This handles stale indices and out-of-sync
          // bodies so the user-visible delete always succeeds.
          if (startIdx < 0 && itemPath) {
            const target = itemPath.trim();
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i] ?? "";
              if (!l.trim()) continue;
              const depth = l.match(/^(\t*)/)?.[1]?.length ?? 0;
              if (depth !== 0) continue;
              // Extract the bare wikilink text from this line, in
              // either "- [[x]]" or bare "[[x]]" form.
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
          // Capture the wikilink path of the line we are about to
          // remove so we can mirror the deletion into projectDocs.
          // Without this, an in-memory projectDocs array can resurrect
          // the item on the next render (when card.body is empty,
          // the renderer falls back to projectDocs as the source of
          // truth). This was the "delete the last item and it comes
          // back" symptom.
          const removedPath = (() => {
            const raw = (lines[startIdx] ?? "").replace(/^\t+/, "");
            const m = raw.replace(/^-+\s*/, "").match(/^\[\[([^\]|]+)/);
            if (!m || !m[1]) return undefined;
            return pathToWikiLink(m[1]).slice(2, -2);
          })();
          // Snapshot the lines (and any indented children) BEFORE the
          // splice so the undo path can re-insert them verbatim.
          const removedLines = lines.slice(startIdx, endIdx);
          lines.splice(startIdx, endIdx - startIdx);
          // Normalize: drop any trailing empty lines that the splice
          // may have introduced so the body stays compact.
          while (lines.length > 0 && !lines[lines.length - 1]!.trim()) {
            lines.pop();
          }
          const body = lines.join("\n");

          // Mirror the removal into projectDocs so the two data
          // sources stay in sync. We try the captured wikilink path
          // first, then fall back to the index-based position.
          type DocEntry = { path: string; children?: unknown[] } | string;
          let nextProjectDocs: DocEntry[] | undefined = (
            card as {
              projectDocs?: DocEntry[];
            }
          ).projectDocs;
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
              nextProjectDocs = nextProjectDocs.filter((_, i) => i !== dropIdx);
              // Capture for the undo entry: the removed body lines +
              // the path + the projectDoc slot it was dropped from.
              undoSnapshot = {
                kind: "projectItem",
                cardId,
                itemPath,
                removedLines,
                removedPath,
                removedProjectDocIdx: dropIdx,
              };
            } else if (removedLines.length > 0) {
              // No projectDoc entry to mirror, but still snapshot the
              // body lines so undo can re-insert them.
              undoSnapshot = {
                kind: "projectItem",
                cardId,
                itemPath,
                removedLines,
                removedPath,
                removedProjectDocIdx: -1,
              };
            }
          } else if (removedLines.length > 0) {
            undoSnapshot = {
              kind: "projectItem",
              cardId,
              itemPath,
              removedLines,
              removedPath,
              removedProjectDocIdx: -1,
            };
          }

          // Normalize projectDocs back to ProjectDocNode[] (the
          // shape DashboardCard expects). If the source array held
          // plain strings we promote them, matching the other sync
          // helpers (addDocToCard etc.) which always store
          // {path, children}.
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
    if (undoSnapshot) this.pushUndo(undoSnapshot);
    await this.writeToDisk();
  }

  async addFileLinkToMemo(cardId: string, filePath: string): Promise<void> {
    if (!this.data) return;

    this.data = {
      ...this.data,
      columns: this.data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((card) => {
          if (card.id !== cardId) return card;
          // Use the shared helper so memo file links are written in
          // the canonical wikilink form (basename only, no folder
          // prefix, no ".md" suffix).
          const link = pathToWikiLink(filePath);
          if (card.body.includes(link)) return card;
          const body = card.body ? `${card.body}\n${link}` : link;
          return { ...card, body };
        }),
      })),
    };
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
    await this.updateCard(cardId, { hideCompleted });
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

    const content = generateDefaultMarkdown();
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
    if (!this.file) return;

    const content = await this.app.vault.read(this.file);
    const hash = simpleHash(content);
    if (hash === this.lastWrittenHash) return;

    this.data = parse(content);
    this.notifyCallbacks();
  }

  private async writeToDisk(): Promise<void> {
    if (!this.data || !this.file) return;

    const content = serialize(this.data);
    const hash = simpleHash(content);

    const fileRef = this.file;
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const current = await this.app.vault.read(fileRef);

        // Safety: skip write if the new content is drastically smaller
        // than the current file. The previous blanket 30% threshold was
        // too aggressive — it blocked legitimate user actions like
        // "delete the last project item from a small dashboard file"
        // (the markdown shrinks but is still a valid dashboard),
        // which manifested as "the item comes back on reload".
        //
        // The real risk this guard was trying to prevent is the banner
        // image being lost (banner image data lives inside the markdown
        // file as a base64 dataURL and a content reset would wipe it
        // silently). So instead of a global size ratio, we compare the
        // banner section of the new content against the banner section
        // of the current file. If the banner is preserved, the user-
        // visible content is allowed to shrink freely.
        const newBannerLen = extractBannerSectionLength(content);
        const currentBannerLen = extractBannerSectionLength(current);
        if (currentBannerLen > 0 && newBannerLen < currentBannerLen * 0.5) {
          console.warn(
            "Dashboard write skipped: banner image appears to have been lost (new banner section < 50% of current).",
          );
          return;
        }

        // Backup current file before overwriting
        await this.createBackup(current);

        await this.app.vault.modify(fileRef, content);
        this.lastWrittenHash = hash;
      } catch (err) {
        console.error("Dashboard sync write failed:", err);
      }
    });

    this.notifyCallbacks();
  }

  private async createBackup(currentContent: string): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      const dir = SyncEngine.BACKUP_DIR;
      if (!(await adapter.exists(dir))) {
        await adapter.mkdir(dir);
      }

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = dir + "/dashboard-" + ts + ".md";
      await adapter.write(backupPath, currentContent);

      // Prune old backups, keep only MAX_BACKUPS
      const files = await adapter.list(dir);
      const backups = files.files
        .filter(
          (f: string) => f.startsWith(dir + "/dashboard-") && f.endsWith(".md"),
        )
        .sort();
      while (backups.length > SyncEngine.MAX_BACKUPS) {
        await adapter.remove(backups.shift()!);
      }
    } catch {
      // Backup failure should never block the main write
    }
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
