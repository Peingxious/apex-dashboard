import type { App } from "obsidian";
import type {
  BannerData,
  CardType,
  CardSize,
  DashboardCard,
  DashboardColumn,
  DashboardData,
  QuickAction,
  TaskItem,
  WeatherConfig,
  TrackerConfig,
  LibraryConfig,
  ProjectDocNode,
} from "./types";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { t } from "./i18n";

const KNOWN_METADATA_KEYS = new Set([
  "link",
  "progress",
  "due",
  "streak",
  "type",
  "color",
  "cover",
  "width",
  "size",
  "lat",
  "lon",
  "city",
  "track",
  "days",
  "cols",
  "rows",
  "gcol",
  "grow",
]);

const REMINDER_REGEX = /\s*⏰\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*$/;

const DEFAULT_BANNER: BannerData = {
  quote: "",
  author: "",
  image: "",
};

const DEFAULT_COLUMNS = [
  { name: "Memo", color: "#f59e0b", sectionType: "memo" },
  { name: "Todo", color: "#6366f1", sectionType: "todo" },
  { name: "Projects", color: "#10b981", sectionType: "projects" },
  { name: "Library", color: "#8b5cf6", sectionType: "projects" },
];

/**
 * Top-level frontmatter keys that the plugin owns and writes back
 * verbatim. Anything NOT in this set is a user-owned key and must
 * be preserved through parse → mutate → serialize round-trips so
 * the plugin does not silently WIPE OUT user metadata (e.g. a
 * `Type: dashboard` field declared on the dashboard note itself).
 *
 * Compare against KNOWN_METADATA_KEYS further down — that one
 * applies to per-card metadata inside the body, not top-level
 * frontmatter.
 */
const KNOWN_FRONTMATTER_KEYS = new Set([
  "banner",
  "quickActions",
  "quickLinks", // legacy: migrated to quickActions on read
  "quickActionOrder",
  "hiddenPresets",
  "columns",
]);

export function parse(markdown: string): DashboardData {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const banner = parseBanner(frontmatter);
  const quickActions = parseQuickActions(frontmatter);
  const quickActionOrder = parseQuickActionOrder(frontmatter);
  const columnDefs = parseColumnDefs(frontmatter);
  const { columns, h1Heading } = parseColumnsWithH1(body, columnDefs);

  // Capture every frontmatter key the plugin does not own so we can
  // write it back unchanged on serialize. Without this, the next
  // save would drop user-owned fields like `Type: dashboard`,
  // `tags: [...]`, `cssclass: dashboard`, etc.
  const extraFrontmatter: Record<string, unknown> = {};
  for (const key of Object.keys(frontmatter)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) {
      extraFrontmatter[key] = frontmatter[key];
    }
  }

  const data: DashboardData = { banner, quickActions, columns };
  if (quickActionOrder) data.quickActionOrder = quickActionOrder;
  if (h1Heading) data.h1Heading = h1Heading;
  const hiddenPresets = parseHiddenPresets(frontmatter);
  if (hiddenPresets) data.hiddenPresets = hiddenPresets;
  if (Object.keys(extraFrontmatter).length > 0) {
    data.extraFrontmatter = extraFrontmatter;
  }
  return data;
}

/**
 * Convert a vault file path into a wikilink string.
 * - Strips the ".md" extension
 * - Drops the folder prefix and uses just the basename so the link
 *   stays short and clean
 * - Wraps the result in `[[...]]`
 *
 * This is the single source of truth for "how do we write a file as a
 * wikilink" — used by both serialize() and the view callbacks that
 * mutate card body / projectDocs.
 */
export function pathToWikiLink(rawPath: string): string {
  let p = rawPath;
  if (p.toLowerCase().endsWith(".md")) p = p.slice(0, -3);
  const slash = p.lastIndexOf("/");
  const basename = slash >= 0 ? p.slice(slash + 1) : p;
  return `[[${basename}]]`;
}

export function serialize(data: DashboardData, app?: App): string {
  const lines: string[] = [];

  lines.push("---");

  // Write back user-owned frontmatter keys BEFORE the plugin-owned
  // ones, so any `Type: dashboard` / `cssclass: ...` / `tags: [...]`
  // field that lives in the original note is preserved on the next
  // save. The plugin's own keys (`banner`, `columns`, ...) are
  // appended afterwards and will override these only if a user
  // happened to use a colliding name (which is an actual conflict,
  // not data loss). Without this block the serialize pass would
  // silently WIPE OUT every key that is not part of the plugin's
  // schema.
  if (data.extraFrontmatter && Object.keys(data.extraFrontmatter).length > 0) {
    const extraYaml = stringifyYaml(data.extraFrontmatter, {
      lineWidth: 0,
    }).trimEnd();
    if (extraYaml) {
      // Indent every line of the extra block by 0 spaces (top-level
      // keys must sit at column 0 inside the frontmatter), then
      // append. The block already contains its own internal newlines
      // and child-key indentation; we just need to make sure there
      // are no trailing blank lines that would create a double-blank
      // after the `---` closer.
      for (const line of extraYaml.split(/\r?\n/)) {
        lines.push(line);
      }
    }
  }

  lines.push("banner:");
  if (data.banner.image) {
    lines.push(`  image: "${data.banner.image}"`);
  }
  if (data.banner.images && data.banner.images.length > 0) {
    lines.push("  images:");
    for (const img of data.banner.images) {
      lines.push(`    - "${escapeYamlString(img)}"`);
    }
  }

  if (data.quickActions.length > 0) {
    lines.push("quickActions:");
    for (const action of data.quickActions) {
      lines.push(`  - name: "${escapeYamlString(action.name)}"`);
      lines.push(`    icon: "${escapeYamlString(action.icon)}"`);
      lines.push(`    type: ${action.type}`);
      lines.push(`    target: "${escapeYamlString(action.target)}"`);
    }
  }

  if (data.quickActionOrder && data.quickActionOrder.length > 0) {
    lines.push("quickActionOrder:");
    for (const key of data.quickActionOrder) {
      lines.push(`  - "${escapeYamlString(key)}"`);
    }
  }

  if (data.hiddenPresets && data.hiddenPresets.length > 0) {
    lines.push("hiddenPresets:");
    for (const key of data.hiddenPresets) {
      lines.push(`  - "${escapeYamlString(key)}"`);
    }
  }

  lines.push("columns:");
  for (const col of data.columns) {
    lines.push(`  - name: "${escapeYamlString(col.name)}"`);
    if (col.sectionType) {
      lines.push(`    type: ${col.sectionType}`);
    }
    if (col.libraryConfig) {
      lines.push("    library:");
      const lc = col.libraryConfig;
      lines.push(`      viewMode: ${lc.viewMode}`);
      lines.push(`      sortBy: "${lc.sortBy}"`);
      lines.push(`      sortDesc: ${lc.sortDesc}`);
      if (lc.kanbanGroupBy) {
        lines.push(
          `      kanbanGroupBy: "${escapeYamlString(lc.kanbanGroupBy)}"`,
        );
      }
      if (lc.pageSize) {
        lines.push(`      pageSize: ${lc.pageSize}`);
      }
      if (lc.visibleProperties && lc.visibleProperties.length > 0) {
        lines.push(
          `      visibleProperties: [${lc.visibleProperties
            .map((p) => `"${escapeYamlString(p)}"`)
            .join(", ")}]`,
        );
      }
      if (lc.quickDateFilter) {
        lines.push(`      quickDateFilter:`);
        lines.push(`        property: "${lc.quickDateFilter.property}"`);
        lines.push(`        start: "${lc.quickDateFilter.start}"`);
        lines.push(`        end: "${lc.quickDateFilter.end}"`);
      }
      if (lc.filters.length > 0) {
        lines.push("      filters:");
        for (const filter of lc.filters) {
          lines.push(
            `        - property: "${escapeYamlString(filter.property)}"`,
          );
          if (filter.values.length > 0) {
            lines.push(
              `          values: [${filter.values.map((v) => `"${escapeYamlString(v)}"`).join(", ")}]`,
            );
          } else {
            lines.push("          values: []");
          }
          if (filter.dateRange) {
            if (filter.dateRange.start)
              lines.push(`          dateStart: "${filter.dateRange.start}"`);
            if (filter.dateRange.end)
              lines.push(`          dateEnd: "${filter.dateRange.end}"`);
          }
        }
      }
    }
  }

  lines.push("---");
  lines.push("");

  // Preserve the original H1 heading line(s) (e.g. "# [[Note]] #Tag")
  if (data.h1Heading) {
    lines.push(data.h1Heading);
    lines.push("");
  }

  for (const column of data.columns) {
    lines.push(`## ${column.name}`);
    lines.push("");

    if (column.sectionType === "library") continue;

    for (const card of column.cards) {
      // New format: use bullet list instead of ### headings
      // Card title becomes a top-level bullet item
      // Card body/metadata becomes indented sub-items
      const cardLines: string[] = [];
      const metadataLines: string[] = [];

      // type: task / type: project 不再写入 MD，这些信息记录在 columns 的 sectionType 中
      // wikiLink / url 也作为独立字段存储，不再写入 MD 的 link 元数据行
      // 这样避免在编辑卡片的 body 文本框中出现 "- link: [[xxx]]" 行

      // progress / due / color 不再写入 MD，避免在卡片内容区出现属性行

      if (card.coverImage) {
        metadataLines.push(`cover: ${card.coverImage}`);
      }

      if (card.width > 0) {
        metadataLines.push(`width: ${card.width}`);
      }
      if (card.size && card.size !== "M") {
        metadataLines.push(`size: ${card.size}`);
      }
      if (card.gridCols > 0) {
        metadataLines.push(`cols: ${card.gridCols}`);
      }
      if (card.gridRows > 0) {
        metadataLines.push(`rows: ${card.gridRows}`);
      }
      if (card.gridCol > 0) {
        metadataLines.push(`gcol: ${card.gridCol}`);
      }
      if (card.gridRow > 0) {
        metadataLines.push(`grow: ${card.gridRow}`);
      }
      if (card.hideCompleted) {
        metadataLines.push(`hideCompleted: true`);
      }
      if (card.weatherConfig) {
        const wc = card.weatherConfig;
        metadataLines.push(`lat: ${wc.latitude}`);
        metadataLines.push(`lon: ${wc.longitude}`);
        metadataLines.push(`city: "${escapeYamlString(wc.cityName)}"`);
      }

      if (card.trackerConfig) {
        const tc = card.trackerConfig;
        metadataLines.push(`track: ${tc.key}`);
        metadataLines.push(`days: ${tc.days}`);
      }

      if (card.blockquote) {
        metadataLines.push(`> ${card.blockquote}`);
      }

      // Build the card as a bullet list item
      lines.push(`- ${card.title}`);

      // Indented metadata
      for (const ml of metadataLines) {
        lines.push(`\t- ${ml}`);
      }

      // Indented tasks
      if (card.tasks.length > 0) {
        for (const task of card.tasks) {
          let taskLine = `\t- [${task.checked ? "x" : " "}] ${task.text}`;
          if (task.reminder) taskLine += ` ⏰ ${task.reminder}`;
          lines.push(taskLine);
        }
      }

      // Indented body — always use tab-only indent (no "- " prefix)
      // to avoid double-dash corruption on re-serialize cycles
      //
      // Body may be empty when projectDocs is the source of truth
      // (embedded view writes through projectDocs, not body). In that
      // case we synthesize a body from projectDocs so the markdown
      // round-trip is preserved on save.
      // Build a wikilink string from a file path using the shared
      // pathToWikiLink helper. The helper always strips the ".md"
      // extension and the folder prefix so the markdown stays
      // short. We re-import locally here to avoid coupling
      // serialize() callers to the helper's name.
      // Render a stored projectDocs entry as the canonical body
      // line. Mirrors the three-way wrap rule in view.ts:
      //   - "[[Note]]" → keep verbatim.
      //   - bare vault path (has "/" or ends with ".md") → wrap.
      //   - plain text (e.g. "11") → keep verbatim, no wrapping.
      // The previous version of toWikiLink always wrapped via
      // pathToWikiLink, which silently turned stored plain text
      // into `[[11]]` and caused "plain text gets cleaned up to a
      // wikilink" on save.
      const toWikiLink = (rawPath: string): string => {
        // Defensive: even though the parameter is typed as `string`,
        // projectDocs synthesis may receive a non-string value (e.g.
        // a ProjectDocNode object passed in by accident from older
        // code paths). Treat anything that isn't a string as empty
        // instead of throwing ".includes is not a function".
        if (typeof rawPath !== "string") return "";
        if (rawPath.includes("[[")) return rawPath;
        if (!rawPath.includes("/") && !rawPath.toLowerCase().endsWith(".md")) {
          return rawPath;
        }
        return pathToWikiLink(rawPath);
      };
      let bodySource = card.body;
      const projectDocsAny = (card as any).projectDocs as
        | { path: string; children?: string[] }[]
        | string[]
        | undefined;
      if (
        !bodySource.trim() &&
        Array.isArray(projectDocsAny) &&
        projectDocsAny.length > 0
      ) {
        const synthesized: string[] = [];
        for (const doc of projectDocsAny) {
          if (typeof doc === "string") {
            synthesized.push(`- ${toWikiLink(doc)}`);
          } else if (
            doc &&
            typeof doc === "object" &&
            typeof doc.path === "string"
          ) {
            synthesized.push(`- ${toWikiLink(doc.path)}`);
            if (Array.isArray(doc.children)) {
              for (const child of doc.children) {
                // Defensive: children may be plain strings (legacy
                // / hand-written projectDocs) OR ProjectDocNode
                // objects (the schema's own shape — children are
                // always ProjectDocNode[]). Extract the path from
                // either shape so the on-disk markdown still
                // round-trips, and so we never call `.includes` on
                // an object (which was the source of the
                // "d.includes is not a function" crash on dragging
                // the last project item out of a card).
                const childPath =
                  typeof child === "string"
                    ? child
                    : child &&
                        typeof (child as { path?: unknown }).path === "string"
                      ? (child as { path: string }).path
                      : "";
                if (!childPath) continue;
                synthesized.push(`\t- ${toWikiLink(childPath)}`);
              }
            }
          }
        }
        bodySource = synthesized.join("\n");
      }
      const bodyLines = bodySource.trim();
      if (bodyLines) {
        for (const bl of bodyLines.split("\n")) {
          if (bl.trim()) {
            lines.push(`\t${bl}`);
          }
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

export function generateDefaultMarkdown(): string {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return serialize({
    banner: DEFAULT_BANNER,
    quickActions: [],
    columns: [
      {
        name: "Memo",
        color: "#f59e0b",
        sectionType: "memo",
        cards: [
          {
            id: generateId(t("default.memoTitle", { date: dateStr }), "Memo"),
            title: t("default.memoTitle", { date: dateStr }),
            type: "generic" as CardType,
            column: "Memo",
            body: t("default.memoBody"),
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
          {
            id: generateId(t("default.memoPathTitle"), "Memo"),
            title: t("default.memoPathTitle"),
            type: "generic" as CardType,
            column: "Memo",
            body: t("default.memoPathBody"),
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
          {
            id: generateId(t("default.memoDeleteTitle"), "Memo"),
            title: t("default.memoDeleteTitle"),
            type: "generic" as CardType,
            column: "Memo",
            body: t("default.memoDeleteBody"),
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
        ],
      },
      {
        name: "Todo",
        color: "#6366f1",
        sectionType: "todo",
        cards: [
          {
            id: generateId(t("default.todoTitle1"), "Todo"),
            title: t("default.todoTitle1"),
            type: "task" as CardType,
            column: "Todo",
            body: "",
            tasks: [
              { text: t("default.todo1"), checked: false },
              { text: t("default.todo2"), checked: false },
              { text: t("default.todo3"), checked: false },
              { text: t("default.todo4"), checked: false },
            ],
            url: "",
            wikiLink: "",
            progress: -1,
            streak: 0,
            dueDate: "",
            blockquote: "",
            color: "",
            coverImage: "",
            width: 0,
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
            hideCompleted: false,
          },
          {
            id: generateId(t("default.todoTitle2"), "Todo"),
            title: t("default.todoTitle2"),
            type: "task" as CardType,
            column: "Todo",
            body: "",
            tasks: [
              { text: t("default.guide1"), checked: false },
              { text: t("default.guide2"), checked: false },
              { text: t("default.guide3"), checked: false },
              { text: t("default.guide4"), checked: false },
            ],
            url: "",
            wikiLink: "",
            progress: -1,
            streak: 0,
            dueDate: "",
            blockquote: "",
            color: "",
            coverImage: "",
            width: 0,
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
        ],
      },
      {
        name: "Projects",
        color: "#10b981",
        sectionType: "projects",
        cards: [
          {
            id: generateId(t("default.projectTitle"), "Projects"),
            title: t("default.projectTitle"),
            type: "project" as CardType,
            column: "Projects",
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
        ],
      },
      {
        name: "Library",
        color: "#8b5cf6",
        sectionType: "projects",
        cards: [
          {
            id: generateId("Reading", "Library"),
            title: "Reading",
            type: "project" as CardType,
            column: "Library",
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
          {
            id: generateId("To Read", "Library"),
            title: "To Read",
            type: "project" as CardType,
            column: "Library",
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
          {
            id: generateId("Done", "Library"),
            title: "Done",
            type: "project" as CardType,
            column: "Library",
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
            size: "M" as CardSize,
            gridCols: 0,
            gridRows: 0,
            gridCol: 0,
            gridRow: 0,
          },
        ],
      },
    ],
  });
}

function splitFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: trimmed };
  }

  const end = trimmed.indexOf("---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: trimmed };
  }

  const yaml = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 3).trim();

  return {
    frontmatter: (parseYaml(yaml) ?? {}) as Record<string, unknown>,
    body,
  };
}

function parseBanner(fm: Record<string, unknown>): BannerData {
  const raw = fm.banner;

  // Handle plain string: banner: https://example.com/image.jpg
  if (typeof raw === "string" && raw.trim()) {
    return {
      quote: "",
      author: "",
      image: raw.trim(),
    };
  }

  // Handle object: banner:\n  image: path/to/img.jpg
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BANNER };
  const obj = raw as Record<string, unknown>;

  const imagesRaw = obj.images;
  let images: string[] | undefined;
  if (Array.isArray(imagesRaw)) {
    images = (imagesRaw as unknown[])
      .map((item: unknown) => String(item))
      .filter((s: string) => s.trim());
  }

  return {
    quote: "",
    author: "",
    image: (obj.image as string) ?? "",
    images,
  };
}

function parseQuickActions(fm: Record<string, unknown>): QuickAction[] {
  const rawActions = fm.quickActions;
  if (Array.isArray(rawActions)) {
    return rawActions
      .map((item: Record<string, string>) => ({
        name: item.name ?? "",
        icon: item.icon ?? (item.type === "command" ? "terminal" : "file-text"),
        type: (item.type === "command" ? "command" : "file") as
          | "file"
          | "command",
        target: item.target ?? "",
      }))
      .filter((a) => a.name && a.target);
  }

  // Backward compat: migrate old quickLinks
  const rawLinks = fm.quickLinks;
  if (Array.isArray(rawLinks)) {
    return rawLinks
      .map((item: Record<string, string>) => ({
        name: item.name ?? "",
        icon: "file-text",
        type: "file" as const,
        target: item.path ?? "",
      }))
      .filter((a) => a.name && a.target);
  }

  return [];
}

function parseQuickActionOrder(
  fm: Record<string, unknown>,
): string[] | undefined {
  const raw = fm.quickActionOrder;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((v: unknown) => String(v));
  }
  return undefined;
}

function parseHiddenPresets(fm: Record<string, unknown>): string[] | undefined {
  const raw = fm.hiddenPresets;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((v: unknown) => String(v));
  }
  return undefined;
}

function parseColumnDefs(fm: Record<string, unknown>): Array<{
  name: string;
  color: string;
  sectionType?: string;
  libraryConfig?: LibraryConfig;
}> {
  const raw = fm.columns;
  if (!Array.isArray(raw)) return DEFAULT_COLUMNS;

  return (raw as Array<Record<string, unknown>>).map((item) => ({
    name: String(item.name ?? "Unnamed"),
    color: String(item.color ?? "#6366f1"),
    sectionType: item.type ? String(item.type) : undefined,
    libraryConfig: item.library
      ? parseLibraryConfig(item.library as Record<string, unknown>)
      : undefined,
  }));
}

function parseColumns(
  body: string,
  defs: Array<{
    name: string;
    color: string;
    sectionType?: string;
    libraryConfig?: LibraryConfig;
  }>,
): DashboardColumn[] {
  const sections = splitByH2(body);
  const defMap = new Map(defs.map((d) => [d.name, d]));
  const usedDefIndices = new Set<number>();

  return sections.map((section, sectionIdx) => {
    let def = defMap.get(section.heading);
    if (!def && sectionIdx < defs.length && !usedDefIndices.has(sectionIdx)) {
      def = defs[sectionIdx];
    }
    if (def) {
      const defIdx = defs.indexOf(def);
      usedDefIndices.add(defIdx);
    }
    const sectionType = resolveSectionType(
      section.heading,
      [],
      def?.sectionType,
    );
    const cards = parseCards(section.content, section.heading, sectionType);
    return {
      name: section.heading,
      color: def?.color ?? "#6366f1",
      sectionType,
      cards,
      libraryConfig: def?.libraryConfig,
    };
  });
}

function resolveSectionType(
  name: string,
  cards: DashboardCard[],
  fallback?: string,
): string {
  if (fallback) return fallback;

  const lower = name.toLowerCase();
  if (lower === "memo") return "memo";
  if (lower === "todo") return "todo";
  if (lower === "projects") return "projects";
  if (lower === "notes") return "notes";
  if (lower === "dashboard") return "dashboard";
  if (lower === "library") return "library";

  if (cards.length > 0) {
    const types = new Set(cards.map((c) => c.type));
    const dashboardTypes = new Set(["weather", "tracker"]);
    if ([...types].every((t) => dashboardTypes.has(t)) && types.size > 0)
      return "dashboard";
    if (types.has("task") && types.size === 1) return "todo";
    if (types.has("task") && !types.has("project")) return "todo";
    if (types.has("project") && types.size === 1) return "projects";
    if (types.has("generic") && !types.has("project") && !types.has("task"))
      return "memo";
  }

  return "projects";
}

function parseLibraryConfig(raw: Record<string, unknown>): LibraryConfig {
  const filters: import("./types").PropertyFilter[] = [];
  const rawFilters = raw.filters;
  if (Array.isArray(rawFilters)) {
    for (const item of rawFilters) {
      const rec = item as Record<string, unknown>;
      const property = String(rec.property ?? "");
      const rawValues = rec.values;
      const values = Array.isArray(rawValues)
        ? rawValues.map((v: unknown) => String(v))
        : [];
      const dateStart = rec.dateStart ? String(rec.dateStart) : "";
      const dateEnd = rec.dateEnd ? String(rec.dateEnd) : "";
      const dateRange =
        dateStart || dateEnd ? { start: dateStart, end: dateEnd } : undefined;
      filters.push({ property, values, dateRange });
    }
  }

  return {
    filters,
    viewMode: (["grid", "list", "table", "kanban"].includes(
      String(raw.viewMode ?? ""),
    )
      ? raw.viewMode
      : "grid") as import("./types").LibraryViewMode,
    sortBy: String(raw.sortBy ?? "modified"),
    sortDesc: raw.sortDesc !== false,
    kanbanGroupBy: raw.kanbanGroupBy ? String(raw.kanbanGroupBy) : undefined,
    pageSize: typeof raw.pageSize === "number" ? raw.pageSize : undefined,
    visibleProperties: Array.isArray(raw.visibleProperties)
      ? (raw.visibleProperties as unknown[])
          .map((v) => String(v))
          .filter(Boolean)
      : undefined,
    quickDateFilter:
      raw.quickDateFilter && typeof raw.quickDateFilter === "object"
        ? {
            property:
              (raw.quickDateFilter as Record<string, unknown>).property ===
              "modified"
                ? ("modified" as const)
                : ("created" as const),
            start: String(
              (raw.quickDateFilter as Record<string, unknown>).start ?? "",
            ),
            end: String(
              (raw.quickDateFilter as Record<string, unknown>).end ?? "",
            ),
          }
        : undefined,
  };
}
/** Parse columns from body while preserving any H1 heading that precedes ## sections */
function parseColumnsWithH1(
  body: string,
  defs: Array<{
    name: string;
    color: string;
    sectionType?: string;
    libraryConfig?: LibraryConfig;
  }>,
): { columns: DashboardColumn[]; h1Heading?: string } {
  // Extract H1 heading(s) — lines starting with # (but not ##) before the first ##
  const lines = body.split("\n");
  const h1Lines: string[] = [];
  let bodyStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("## ")) {
      bodyStartIdx = i;
      break;
    }
    if (
      /^#\s/.test(trimmed) ||
      trimmed.startsWith("#[") ||
      /^#[\w\u4e00-\u9fff]/.test(trimmed)
    ) {
      h1Lines.push(lines[i]);
      bodyStartIdx = i + 1;
    } else if (!trimmed && h1Lines.length === 0) {
      // skip blank lines before H1
      bodyStartIdx = i + 1;
    } else if (trimmed && h1Lines.length === 0) {
      // non-H1 non-empty content before first section — stop looking
      bodyStartIdx = i;
      break;
    }
  }
  const h1Heading = h1Lines.length > 0 ? h1Lines.join("\n").trim() : undefined;
  const remainingBody = lines.slice(bodyStartIdx).join("\n");
  const columns = parseColumns(remainingBody, defs);
  return { columns, h1Heading };
}

function splitByH2(body: string): Array<{ heading: string; content: string }> {
  const lines = body.split("\n");
  const sections: Array<{ heading: string; content: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) {
        sections.push({
          heading: current.heading,
          content: current.lines.join("\n").trim(),
        });
      }
      current = { heading: line.slice(3).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({
      heading: current.heading,
      content: current.lines.join("\n").trim(),
    });
  }

  return sections;
}

function parseCards(
  content: string,
  columnName: string,
  sectionType: string,
): DashboardCard[] {
  // Try new format first: bullet list items
  const bulletCards = parseCardsFromBullets(content, columnName, sectionType);
  if (bulletCards.length > 0) return bulletCards;

  // Fallback to old ### format for backward compatibility
  const blocks = splitByH3(content);
  return blocks.map((block) => parseCard(block, columnName, sectionType));
}

/**
 * Parse cards from the new bullet-list format:
 * - Card Title
 *   - metadata line
 *   - [ ] task
 *   - body line
 */
function parseCardsFromBullets(
  content: string,
  columnName: string,
  sectionType: string,
): DashboardCard[] {
  const lines = content.split("\n");
  const cards: DashboardCard[] = [];
  let currentCard: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    // Top-level bullet: new card
    // Note: - [[wiki]] titles start with '- [' so we must NOT use startsWith('- [')
    // Only skip actual task checkbox lines: '- [x]' or '- [ ]'
    const isTaskCheckbox = /^-\s+\[[ x]\]/.test(line);
    if (
      line.startsWith("- ") &&
      !line.startsWith("-\t") &&
      !isTaskCheckbox &&
      !line.startsWith("  - ")
    ) {
      if (currentCard) {
        cards.push(
          parseCard(
            {
              title: currentCard.title,
              body: currentCard.lines.join("\n").trim(),
            },
            columnName,
            sectionType,
          ),
        );
      }
      currentCard = { title: line.slice(2).trim(), lines: [] };
    } else if (currentCard) {
      // Preserve original line with indentation for memo/project sections
      if (sectionType === "memo" || sectionType === "projects") {
        // Strip the first \t (markdown nesting) to recover the user's original content
        const stripped = line.startsWith("\t") ? line.slice(1) : line;
        currentCard.lines.push(stripped);
      } else if (sectionType === "todo") {
        // For todo sections: strip one level of indentation to get clean task/metadata lines
        let contentLine = line;
        if (contentLine.startsWith("\t")) {
          contentLine = contentLine.slice(1);
        } else if (contentLine.startsWith("  ")) {
          contentLine = contentLine.slice(2);
        }
        currentCard.lines.push(contentLine);
      } else {
        // For other sections: strip first indent level
        let contentLine = line;
        if (contentLine.startsWith("\t- [")) {
          contentLine = contentLine.slice(1);
        } else if (contentLine.startsWith("\t- ")) {
          contentLine = contentLine.slice(3);
        } else if (contentLine.startsWith("  - [")) {
          contentLine = contentLine.slice(2);
        } else if (contentLine.startsWith("  - ")) {
          contentLine = contentLine.slice(4);
        } else if (contentLine.startsWith("\t")) {
          contentLine = contentLine.slice(1);
        }
        currentCard.lines.push(contentLine);
      }
    }
  }

  if (currentCard) {
    cards.push(
      parseCard(
        { title: currentCard.title, body: currentCard.lines.join("\n").trim() },
        columnName,
        sectionType,
      ),
    );
  }

  return cards;
}

function splitByH3(content: string): Array<{ title: string; body: string }> {
  const lines = content.split("\n");
  const blocks: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current) {
        blocks.push({
          title: current.title,
          body: current.lines.join("\n").trim(),
        });
      }
      current = { title: line.slice(4).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    blocks.push({
      title: current.title,
      body: current.lines.join("\n").trim(),
    });
  }

  return blocks;
}

function parseCard(
  block: { title: string; body: string },
  columnName: string,
  sectionType: string,
): DashboardCard {
  // For memo sections: store raw body as-is (preserving indentation)
  if (sectionType === "memo") {
    const id = generateId(block.title, columnName);
    return {
      id,
      title: block.title,
      type: "note" as CardType,
      column: columnName,
      body: block.body,
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
      size: "M" as CardSize,
      gridCols: 0,
      gridRows: 0,
      gridCol: 0,
      gridRow: 0,
    };
  }

  // For project sections: parse nested doc links
  if (sectionType === "projects" || sectionType === "notes") {
    const projectDocs = parseProjectDocs(block.body);
    const id = generateId(block.title, columnName);
    return {
      id,
      title: block.title,
      type:
        projectDocs.length > 0
          ? ("project" as CardType)
          : ("generic" as CardType),
      column: columnName,
      body: block.body,
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
      size: "M" as CardSize,
      gridCols: 0,
      gridRows: 0,
      gridCol: 0,
      gridRow: 0,
      projectDocs,
    };
  }

  const { metadata, tasks, blockquote, cleanBody } = extractCardParts(
    block.body,
  );
  const cardType = detectCardType(tasks, blockquote, metadata);
  const weatherConfig =
    cardType === "weather" ? parseWeatherConfig(metadata) : undefined;
  const trackerConfig =
    cardType === "tracker" ? parseTrackerConfig(metadata) : undefined;

  return {
    id: generateId(block.title, columnName),
    title: block.title,
    type: cardType,
    column: columnName,
    body: cleanBody,
    tasks,
    url: extractUrl(metadata),
    wikiLink: extractWikiLink(metadata),
    progress: extractProgress(metadata),
    streak: extractStreak(metadata),
    dueDate: extractDue(metadata),
    blockquote,
    color: metadata.color ?? "",
    coverImage: metadata.cover ?? "",
    width: parseInt(metadata.width ?? "0", 10) || 0,
    size: parseCardSize(metadata.size),
    gridCols: parseInt(metadata.cols ?? "0", 10) || 0,
    gridRows: parseInt(metadata.rows ?? "0", 10) || 0,
    gridCol: parseInt(metadata.gcol ?? "0", 10) || 0,
    gridRow: parseInt(metadata.grow ?? "0", 10) || 0,
    weatherConfig,
    trackerConfig,
    hideCompleted: metadata.hideCompleted === "true",
  };
}

function parseProjectDocs(body: string): ProjectDocNode[] {
  const lines = body.split("\n");
  const roots: ProjectDocNode[] = [];
  const stack: { indent: number; nodes: ProjectDocNode[] }[] = [
    { indent: -1, nodes: roots },
  ];

  for (const line of lines) {
    // Count leading tabs to determine nesting level
    let indent = 0;
    let rest = line;
    while (rest.startsWith("\t")) {
      indent++;
      rest = rest.slice(1);
    }
    // Three shapes must round-trip through parse → synthesize
    // without losing information:
    //   1. "- [[Note]]" / "- [[Note|alias]]" → path keeps the
    //      "[[Note]]" form. This is the critical fix for
    //      "移动会把双链清理了" — the previous version captured
    //      just "Note" (basename), and synthesizeProjectBody
    //      re-classified it as plain text on the next move
    //      because "Note" no longer looked like a vault path.
    //   2. "- folder/Note.md" (bare vault path written by an
    //      older version) → path becomes "[[Note]]" after wrap.
    //   3. "- 11" (plain text typed via the Enter fallback) →
    //      path stays as "11" so synthesize won't double-wrap it.
    const listMatch = rest.match(/^-\s+(.*)$/);
    if (!listMatch || !listMatch[1]) continue;
    const raw = listMatch[1].trim();
    if (!raw) continue;
    const linkMatch = raw.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
    let path: string;
    if (linkMatch) {
      // Already a wikilink — keep the [[ ]] form verbatim.
      path = `[[${linkMatch[1]!.trim()}]]`;
    } else if (raw.includes("/") || raw.toLowerCase().endsWith(".md")) {
      // Bare vault path that somehow got written without
      // brackets — normalise to the canonical wikilink form.
      path = `[[${raw.replace(/\.md$/, "")}]]`;
    } else {
      // Plain text (e.g. "11"). Stays as-is; synthesize uses the
      // same conditional rule and keeps it un-bracketed.
      path = raw;
    }
    const node: ProjectDocNode = { path, children: [] };

    // Find the right parent based on indent level
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }
    stack[stack.length - 1]!.nodes.push(node);
    stack.push({ indent, nodes: node.children });
  }

  return roots;
}

function extractCardParts(body: string): {
  metadata: Record<string, string>;
  tasks: TaskItem[];
  blockquote: string;
  cleanBody: string;
} {
  const lines = body.split("\n");
  const metadata: Record<string, string> = {};
  const tasks: TaskItem[] = [];
  const bodyLines: string[] = [];
  let blockquote = "";

  for (const line of lines) {
    const trimmed = line.trim();

    const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (
      kvMatch &&
      kvMatch[1] &&
      kvMatch[2] &&
      KNOWN_METADATA_KEYS.has(kvMatch[1])
    ) {
      metadata[kvMatch[1]] = kvMatch[2];
      continue;
    }

    const taskMatch = trimmed.match(/^- \[([ xX])\]\s*(.+)$/);
    if (taskMatch && taskMatch[1] && taskMatch[2]) {
      let taskText = taskMatch[2];
      let taskReminder: string | undefined;
      const reminderMatch = taskText.match(REMINDER_REGEX);
      if (reminderMatch) {
        taskText = taskText.replace(REMINDER_REGEX, "");
        taskReminder = reminderMatch[1];
      }
      tasks.push({
        checked: taskMatch[1] !== " ",
        text: taskText,
        reminder: taskReminder,
      });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blockquote += (blockquote ? "\n" : "") + trimmed.slice(2);
      continue;
    }

    if (trimmed) {
      bodyLines.push(trimmed);
    }
  }

  return { metadata, tasks, blockquote, cleanBody: bodyLines.join("\n") };
}

function detectCardType(
  tasks: TaskItem[],
  blockquote: string,
  metadata: Record<string, string>,
): CardType {
  if (metadata.type === "task") return "task";
  if (metadata.type === "project") return "project";
  if (metadata.type === "weather") return "weather";
  if (metadata.type === "tracker") return "tracker";

  const link = metadata.link ?? "";

  if (tasks.length > 0) return "task";
  if (blockquote) return "note";
  if (metadata.streak) return "habit";
  if (link.startsWith("[[")) return "project";
  if (link.startsWith("http")) return "link";
  if (metadata.progress) return "project";
  return "generic";
}

function parseCardSize(raw: string | undefined): CardSize {
  const v = (raw ?? "").toUpperCase().trim();
  if (v === "S" || v === "L") return v;
  return "M";
}

function extractUrl(metadata: Record<string, string>): string {
  const link = metadata.link ?? "";
  return link.startsWith("http") ? link : "";
}

function extractWikiLink(metadata: Record<string, string>): string {
  const link = metadata.link ?? "";
  const match = link.match(/^\[\[(.+)]]$/);
  return match && match[1] ? match[1] : "";
}

function extractProgress(metadata: Record<string, string>): number {
  if (!metadata.progress) return -1;
  const num = parseInt(metadata.progress.replace("%", ""), 10);
  return isNaN(num) ? -1 : Math.min(100, Math.max(0, num));
}

function extractStreak(metadata: Record<string, string>): number {
  if (!metadata.streak) return 0;
  const num = parseInt(metadata.streak, 10);
  return isNaN(num) ? 0 : num;
}

function extractDue(metadata: Record<string, string>): string {
  return metadata.due ?? "";
}

function generateId(title: string, column: string): string {
  const raw = `${title}::${column}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return `card-${Math.abs(hash).toString(36)}`;
}

function escapeYamlString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function dequote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\\\/g, "\\").replace(/\\"/g, '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseWeatherConfig(metadata: Record<string, string>): WeatherConfig {
  return {
    latitude: parseFloat(metadata.lat ?? "0") || 0,
    longitude: parseFloat(metadata.lon ?? "0") || 0,
    cityName: dequote(metadata.city ?? ""),
  };
}

function parseTrackerConfig(metadata: Record<string, string>): TrackerConfig {
  const style = metadata.style ?? "line";
  return {
    key: metadata.track ?? "",
    days: parseInt(metadata.days ?? "14", 10) || 14,
    style: style === "heatmap" || style === "bar" ? style : "line",
  };
}
