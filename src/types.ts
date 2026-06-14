import type { Language } from "./i18n";

export interface DashboardSettings {
  dashboardFile: string;
  recentDocCount: number;
  language: Language;
  stylePreset: string;
  widgetWeatherEnabled: boolean;
  widgetHeatmapEnabled: boolean;
  widgetTrackerKey: string;
  widgetTrackerDays: number;
  widgetTrackerSummary: "streak" | "rate" | "both" | "off";
  widgetWeatherCity: string;
  widgetWeatherLat: number;
  widgetWeatherLon: number;
  pomodoroEnabled: boolean;
  pomodoroWorkMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroLongBreakInterval: number;
  pomodoroAutoStartBreak: boolean;
  pomodoroSoundEnabled: boolean;
  widgetLunarEnabled: boolean;
  widgetOrder: string[];
  countdownEnabled: boolean;
  countdownTargetDate: string;
  countdownDisplayMode: "days" | "hours" | "minutes";
  countdownReminderDays: number;
  countdownLabel: string;
  readingEnabled: boolean;
  readingSoundEnabled: boolean;
  taskTemplates: TaskTemplate[];
  sidebarPinnedDefault: boolean;
  projectHideNestedDocs: boolean;
  /**
   * Global default for whether Todo cards hide completed tasks in the
   * visible list. Used as a fallback when `card.hideCompleted` is
   * undefined (the card's own in-memory toggle is treated as a
   * session-only override on top of this default).
   *
   * NOTE: `card.hideCompleted` itself is **never persisted to the
   * dashboard markdown** (see parser.ts), so the on-disk state of
   * every card is effectively "unset" after every reload — this
   * setting is the single source of truth for the default.
   */
  defaultHideCompleted: boolean;
  /** List of note paths opened as tabs in the workspace dashboard */
  embeddedNoteTabs: string[];
  /** Currently active tab path (null = main dashboard) */
  activeEmbeddedNoteTab: string | null;
  /**
   * Note paths to exclude from the "Open" tab picker. Useful for hiding the
   * main dashboard file or other notes that should not be opened as tabs.
   */
  excludedNotePaths: string[];
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  dashboardFile: "dashboard",
  recentDocCount: 5,
  language: "en",
  stylePreset: "earth",
  widgetWeatherEnabled: false,
  widgetHeatmapEnabled: false,
  widgetTrackerKey: "",
  widgetTrackerDays: 30,
  widgetTrackerSummary: "streak",
  widgetWeatherCity: "Shanghai",
  widgetWeatherLat: 31.23,
  widgetWeatherLon: 121.47,
  pomodoroEnabled: true,
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroLongBreakInterval: 4,
  pomodoroAutoStartBreak: true,
  pomodoroSoundEnabled: true,
  widgetLunarEnabled: true,
  widgetOrder: [
    "weather",
    "lunar",
    "heatmap",
    "pomodoro",
    "reading",
    "countdown",
  ],
  countdownEnabled: false,
  countdownTargetDate: "",
  countdownDisplayMode: "days",
  countdownReminderDays: 0,
  countdownLabel: "",
  readingEnabled: false,
  readingSoundEnabled: true,
  taskTemplates: [],
  sidebarPinnedDefault: true,
  projectHideNestedDocs: true,
  defaultHideCompleted: true,
  embeddedNoteTabs: [],
  activeEmbeddedNoteTab: null,
  excludedNotePaths: ["dashboard"],
};

export interface QuoteItem {
  quote: string;
  author: string;
}

export interface BannerData {
  quote: string;
  author: string;
  image: string;
  quoteColor?: string;
  quotes?: QuoteItem[];
  images?: string[];
}

export interface QuickAction {
  name: string;
  icon: string;
  type: "file" | "command";
  target: string;
}

export const PRESET_ACTIONS: QuickAction[] = [
  {
    name: "New Journal",
    icon: "calendar-plus",
    type: "command",
    target: "daily-notes",
  },
  {
    name: "New Note",
    icon: "plus-circle",
    type: "command",
    target: "file-explorer:new-file",
  },
];

export interface ColumnDef {
  name: string;
  color: string;
}

export type CardType =
  | "task"
  | "note"
  | "link"
  | "project"
  | "habit"
  | "generic"
  | "weather"
  | "tracker"
  | "todoplus";

export interface WeatherConfig {
  latitude: number;
  longitude: number;
  cityName: string;
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  feelsLike: number;
  dailyMax: number[];
  dailyMin: number[];
  dailyCodes: number[];
  dailyDates: string[];
  fetchedAt: number;
}

export type TrackerStyle = "line" | "heatmap" | "bar";

export interface TrackerConfig {
  key: string;
  days: number;
  style: TrackerStyle;
}

export interface TrackerDataPoint {
  date: string;
  value: number | null;
}

export interface TaskItem {
  text: string;
  checked: boolean;
  reminder?: string;
  children?: TaskItem[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  tasks: string[];
}

export type CardSize = "S" | "M" | "L";

export interface DashboardCard {
  id: string;
  title: string;
  type: CardType;
  column: string;
  body: string;
  tasks: TaskItem[];
  url: string;
  wikiLink: string;
  progress: number;
  streak: number;
  dueDate: string;
  blockquote: string;
  color: string;
  coverImage: string;
  width: number;
  size: CardSize;
  gridCols: number;
  gridRows: number;
  gridCol: number;
  gridRow: number;
  /** Session-only override: when true, the todo card hides tasks with
   *  `checked === true` from its visible list. Falls back to
   *  `settings.defaultHideCompleted` when unset. **Not persisted** to
   *  the dashboard markdown (see parser.ts). */
  hideCompleted?: boolean;
  /** For `type === "todoplus"`: the card mirrors a checklist under a
   *  `## <heading>` block in another note. The source pointer is the
   *  card's first-bullet `title` itself — a wikilink of the form
   *  `[[note#heading]]`. The renderer parses the title with
   *  `parseTodoPlusSourceLink` in renderer.ts; there is no separate
   *  `sourceLink` field on the card. The card's `type` is also
   *  derived: it's set to `"todoplus"` automatically when the
   *  enclosing column has `sectionType: todoplus` (see `parseColumns`
   *  in parser.ts), so we don't write a `type: todoplus` line into
   *  the card body either. */
  chartConfig?: never;
  weatherConfig?: WeatherConfig;
  trackerConfig?: TrackerConfig;
  projectDocs?: ProjectDocNode[];
  rawBody?: string;
}

export interface ProjectDocNode {
  path: string;
  children: ProjectDocNode[];
}

export type LibraryViewMode = "grid" | "list" | "table" | "kanban";

export interface PropertyFilter {
  property: string;
  values: string[];
  dateRange?: { start: string; end: string };
}

export interface LibraryConfig {
  filters: PropertyFilter[];
  viewMode: LibraryViewMode;
  sortBy: string;
  sortDesc: boolean;
  kanbanGroupBy?: string;
  pageSize?: number;
  /**
   * 属性筛选显示（仅 table / list 视图生效）
   * - undefined 或空数组：保留旧行为，表格自动从前 20 条 frontmatter 收集，列表只显示 name + date
   * - 非空数组：按勾选顺序作为表格列 / 列表元数据 chip 显式展示
   * 可选 key 包括内置的 name / modified / created，以及 vault 中所有 frontmatter 属性
   */
  visibleProperties?: string[];
  quickDateFilter?: {
    property: "created" | "modified";
    start: string;
    end: string;
  };
}

export interface DashboardColumn {
  name: string;
  color: string;
  sectionType?: string;
  cards: DashboardCard[];
  libraryConfig?: LibraryConfig;
}

export interface DashboardData {
  banner: BannerData;
  quickActions: QuickAction[];
  quickActionOrder?: string[];
  hiddenPresets?: string[];
  columns: DashboardColumn[];
  /** Preserved H1 heading line(s) from original note (e.g. "# [[Note]] #Tag") */
  h1Heading?: string;
  /**
   * Unrecognised top-level frontmatter keys that were present in the
   * source markdown. Preserved verbatim through parse → mutate →
   * serialize round-trips so we do not silently WIPE OUT user-owned
   * metadata when the user edits columns/banner/etc. Example: a
   * frontmatter block with `banner`, `columns`, and a user-owned
   * `Type: dashboard` field must come back with `Type` still set
   * after the plugin re-serialises the file. Only the well-known
   * keys (banner, quickActions, quickLinks, quickActionOrder,
   * hiddenPresets, columns) are stripped; everything else is kept
   * here as the parsed YAML value and re-emitted on serialize.
   */
  extraFrontmatter?: Record<string, unknown>;
}

export interface RenderCallbacks {
  onCardEdit(card: DashboardCard): void;
  onCardDelete(cardId: string): void;
  onCheckboxToggle(cardId: string, taskIndex: number, checked: boolean): void;
  onTaskAdd(cardId: string, text: string): void;
  onTaskDelete(cardId: string, taskIndex: number): void;
  /** Toggle the "hide completed tasks" state on a todo card. */
  onTaskHideCompletedChange(cardId: string, hide: boolean): void;
  onTaskReorder(cardId: string, fromIndex: number, toIndex: number): void;
  onTaskMoveToCard(
    srcCardId: string,
    taskIndex: number,
    destCardId: string,
    destIndex: number,
  ): void;
  onTaskEdit(cardId: string, taskIndex: number, newText: string): void;
  /** Add a new card to `columnName`. For TodoPlus columns, `title`
   *  should be the source wikilink (e.g. `"[[dash002#To-do]]"`);
   *  the renderer reads the source link from the title, and the
   *  column's `sectionType: todoplus` (frontmatter) identifies the
   *  card kind. No `sourceLink` option is needed. */
  onCardAdd(columnName: string, options?: { title?: string }): void;
  onColumnAdd(name: string, sectionType?: string): void;
  onBannerEdit(): void;
  onQuickActionAdd(): void;
  onQuickActionRemove(index: number): void;
  onMoveCard(cardId: string, targetColumn: string, targetIndex: number): void;
  onMemoUpdate(
    card: DashboardCard,
    updates: { body: string; blockquote: string },
  ): void;
  onProjectDocsUpdate(card: DashboardCard, docPaths: string[]): void;
  onProjectDocsReorder(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): void;
  onDocMoveToCard(
    srcCardId: string,
    docIndex: number,
    destCardId: string,
    destIndex: number,
  ): void;
  onProjectDocsAdd(card: DashboardCard, docPath: string): void;
  onProjectDocsRemove(card: DashboardCard, topIndex: number): void;
  onMemoColorChange(card: DashboardCard, color: string): void;
  onProjectCoverChange(card: DashboardCard, imagePath: string): void;
  onCardTitleEdit(cardId: string, newTitle: string): void;
  onCardWidthChange(cardId: string, width: number): void;
  onCardSizeChange(cardId: string, size: CardSize): void;
  onCardGridChange(cardId: string, gridCols: number, gridRows: number): void;
  onCardGridMove(cardId: string, gridCol: number, gridRow: number): void;
  onFileDrop(cardId: string, filePath: string): void;
  onProjectItemReorder(
    cardId: string,
    fromIndex: number,
    toIndex: number,
  ): void;
  onProjectItemMoveToCard(
    srcCardId: string,
    itemIndex: number,
    destCardId: string,
    destIndex: number,
  ): void;
  onProjectItemDelete(
    cardId: string,
    itemIndex: number,
    itemPath?: string,
  ): void;
  onProjectGroupAdd(columnName: string, title: string): void;
  onColumnRename(oldName: string, newName: string): void;
  onColumnDelete(columnName: string): void;
  onColumnSectionTypeChange(columnName: string, sectionType: string): void;
  onTaskReminderEdit(
    cardId: string,
    taskIndex: number,
    reminder: string | undefined,
  ): void;
  onAddFromTemplate(columnName: string): void;
  onLibraryConfigChange(columnName: string, config: LibraryConfig): void;
}
