/**
 * src/render/dashboard/card-bodies/projects.ts
 *
 * Project-list card body renderer (depth-0 draggable items
 * with hidden +N child counter) and the simpler habit card
 * body. These two are the "non-task, non-memo" branch of the
 * card-body dispatcher; the dispatcher falls through to
 * `renderProjectBody` whenever the column is not a memo /
 * todo / todoplus column.
 *
 * **Why a separate file**: `renderProjectBody` is the second
 * largest card body in the renderer (~225 lines) and contains
 * the most defensive parsing code in the project pipeline
 * (handling the legacy `card.body` shape, the new
 * `card.projectDocs` shape, wikilink-in-value vs plain-text
 * values, sparse splice holes). The +N child counter loop and
 * the deliberate "do not render children inline" decision are
 * also non-obvious and benefit from being in one focused
 * module. `renderHabitBody` is short but is kept here
 * because it is also a "fall-through" body and is too small
 * to warrant its own file.
 *
 * **Behaviour preservation**:
 *   - Same drag wiring (`dragState.taskItemCallbacks` +
 *     `installDocumentDragListeners()`) as the todo body.
 *   - The "value includes `[[`" / "value is a vault path" /
 *     "value is plain text" three-way branch is preserved
 *     verbatim. This is the fix for the v1.4.x bug where
 *     plain-text entries were double-wrapped as `[[text]]`.
 *   - The hidden-children counter (depth>0 lines between two
 *     depth-0 lines) is preserved; the children themselves
 *     are intentionally NOT rendered inline (comment in the
 *     original source explains why).
 *   - The drag handle, +N badge, and hover-visible delete
 *     button UX are unchanged.
 *   - The add-row uses the same `attachFileSuggest` pattern
 *     as the todo body, and forwards the **replaced** value
 *     (with the user's leading text preserved) to
 *     `onProjectDocsAdd` — same "don't replace my content"
 *     contract.
 *   - The "last item comes back after delete" fix is in the
 *     `delBtn` click handler: the callback receives both
 *     `index` and `title.path` so the sync layer can do a
 *     text-based lookup when the index doesn't resolve.
 */

import { App, setIcon } from "obsidian";
import type {
  DashboardCard,
  ProjectDocNode,
  RenderCallbacks,
} from "../../../types";
import { t } from "../../../i18n";
import { attachFileSuggest } from "../../../file-suggest";
import { renderInlineMarkdown } from "../../wikilink-inline";
import { dragState } from "../../state";
import { installDocumentDragListeners } from "../../drag-and-drop";

/**
 * Render a project-list card body. The card body is parsed
 * from either `card.body` (legacy) or `card.projectDocs`
 * (current data model). Each depth-0 line becomes a
 * draggable item; deeper lines are hidden but counted.
 */
export function renderProjectBody(
  container: HTMLElement,
  card: DashboardCard,
  callbacks: RenderCallbacks,
  app: App,
  sourcePath?: string,
): void {
  dragState.taskItemCallbacks = callbacks;
  installDocumentDragListeners();
  const resolvedSource =
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "";

  // Draggable project items (todo-style):
  //   Each depth-0 line is a draggable item showing title +
  //   child count
  //   depth>=1 sub-items are hidden, counted as "+N"
  //   Items can be reordered within a card or dragged
  //   between project cards

  const list = container.createDiv({ cls: "dashboard-project-list" });
  list.dataset.cardId = card.id;

  // Build a unified lines array from either card.body
  // (markdown) or card.projectDocs (structured array). The
  // embedded view's onProjectDocsAdd writes to projectDocs,
  // while the main workspace writes to body — we need to
  // read from both so both paths render correctly.
  // `card.projectDocs` is declared as `ProjectDocNode[] |
  // undefined` in the type system, but historical frontmatter
  // has both shapes (objects with `path`/`children` and bare
  // `string[]` paths). Read the typed value once, then narrow
  // at the use site instead of double-casting through `any`.
  // The intermediate `unknown[]` is the honest representation
  // — the type system does not actually know which shape the
  // runtime data has, so we treat the field as `unknown[]` and
  // narrow per use.
  const projectDocsRaw: unknown[] | undefined = card.projectDocs as
    | unknown[]
    | undefined;
  const projectDocObjects: ProjectDocNode[] | undefined =
    Array.isArray(projectDocsRaw) && projectDocsRaw.length > 0
      ? (projectDocsRaw as ProjectDocNode[])
      : undefined;
  const projectDocPaths: string[] | undefined =
    Array.isArray(projectDocsRaw) && projectDocsRaw.length > 0
      ? (projectDocsRaw as string[])
      : undefined;
  let lines: string[] = [];
  if (card.body) {
    lines = card.body.split("\n");
  } else if (
    Array.isArray(projectDocObjects) &&
    projectDocObjects.length > 0 &&
    typeof projectDocObjects[0] === "object" &&
    projectDocObjects[0] !== null &&
    "path" in projectDocObjects[0]
  ) {
    // projectDocs is array of {path, children}
    for (const doc of projectDocObjects) {
      // The data model can carry `undefined` entries in
      // legacy states (sparse splice holes, drag pre-bounds-
      // check code paths, partial deserialization). Skip
      // anything that isn't a real object with a string
      // `path` — crashing renderCard would tear down the
      // entire dashboard for one bad row.
      if (!doc || typeof doc !== "object") continue;
      const d = doc as { path?: unknown; children?: unknown };
      if (typeof d.path !== "string" || d.path.length === 0) continue;
      // `doc.path` may be a plain vault path (legacy, e.g.
      // "Folder/Note.md") or a value with leading text +
      // inline wikilink (new behaviour, e.g. "11[[Note]]").
      // For the latter we must NOT wrap it in another
      // [[...]] — doing so would produce nested wikilinks
      // and drop the leading text.
      if (d.path.includes("[[")) {
        // Already a wikilink (possibly with leading text
        // such as "11[[En3]]"). Use verbatim — going
        // through pathToWikiLink would produce nested
        // `[[[[Note]]]]` brackets and corrupt the rendered
        // link.
        lines.push(`- ${d.path}`);
      } else if (d.path.includes("/") || d.path.toLowerCase().endsWith(".md")) {
        // Looks like a vault path → wrap as `[[basename]]`.
        lines.push(`- [[${d.path.replace(/\.md$/, "")}]]`);
      } else {
        // Plain text (e.g. "11") entered via the Enter
        // fallback. Keep it as a normal list line, no
        // double brackets. This is the fix for
        // "输入普通文本会变成双链笔记".
        lines.push(`- ${d.path}`);
      }
      if (Array.isArray(d.children)) {
        for (const child of d.children) {
          if (typeof child !== "string") continue;
          lines.push(`\t- [[${child}]]`);
        }
      }
    }
  } else if (Array.isArray(projectDocPaths) && projectDocPaths.length > 0) {
    // projectDocs is array of plain paths
    for (const p of projectDocPaths) {
      if (typeof p !== "string") continue;
      if (p.includes("[[")) {
        lines.push(`- ${p}`);
      } else {
        lines.push(`- [[${p}]]`);
      }
    }
  }

  if (lines.length > 0) {
    // Collect title info and child items
    interface TitleInfo {
      cleanText: string;
      path: string;
      childCount: number;
    }
    const titles: TitleInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) continue;
      const depth = line.match(/^(\t*)/)?.[1]?.length ?? 0;
      if (depth !== 0) continue;

      let cleanText = line.replace(/^\t*/, "");
      if (cleanText.startsWith("- ")) cleanText = cleanText.slice(2);
      // Capture the raw wikilink target so the per-item
      // delete button can pass a stable identifier to the
      // sync layer. When the body line has no [[...]] link,
      // fall back to the cleaned text.
      const pathMatch = line.match(/\[\[([^\]|]+)/);
      const path = pathMatch && pathMatch[1] ? pathMatch[1] : cleanText;
      titles.push({ cleanText, path, childCount: 0 });
    }

    // Count hidden children per depth-0 title so the +N
    // badge stays correct. The children themselves are NOT
    // rendered inline — see the comment below the
    // delete-button handler.
    {
      let titleIdx = 0;
      let inlineCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!line.trim()) continue;
        const depth = line.match(/^(\t*)/)?.[1]?.length ?? 0;
        if (depth === 0) {
          if (titleIdx > 0 && titles[titleIdx - 1]) {
            titles[titleIdx - 1]!.childCount = inlineCount;
          }
          titleIdx++;
          inlineCount = 0;
        } else if (titleIdx > 0) {
          inlineCount++;
        }
      }
      if (titleIdx > 0 && titles[titleIdx - 1]) {
        titles[titleIdx - 1]!.childCount = inlineCount;
      }
    }

    titles.forEach((title, index) => {
      const item = list.createDiv({ cls: "dashboard-project-item" });
      item.setAttribute("draggable", "true");
      item.dataset.itemIndex = String(index);
      item.dataset.cardId = card.id;

      // Drag handle indicator
      const dragHandle = item.createSpan({
        cls: "dashboard-project-item-handle",
      });
      setIcon(dragHandle, "grip-vertical");

      // Title text with wiki links
      const titleSpan = item.createSpan({
        cls: "dashboard-project-item-title",
      });
      renderInlineMarkdown(titleSpan, title.cleanText, app, resolvedSource);

      // Child count badge (keep for drag hint)
      if (title.childCount > 0) {
        const countEl = item.createSpan({
          cls: "dashboard-project-child-count",
        });
        countEl.setText(`+${title.childCount}`);
      }

      // Delete button (visible on hover, same UX as todo
      // tasks)
      const delBtn = item.createEl("button", {
        cls: "dashboard-project-item-delete",
        attr: {},
      });
      setIcon(delBtn, "x");
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Pass both the index and the wikilink path so the
        // sync layer can fall back to a text-based lookup
        // when the index doesn't resolve (which would
        // otherwise make the last item "come back" after
        // deletion).
        callbacks.onProjectItemDelete(card.id, index, title.path);
      });

      // Child items are intentionally NOT expanded inline
      // anymore. A project item may carry dozens or hundreds
      // of nested children, and rendering them all as a
      // visible sub-list pushes the real content far down
      // the page. The +N badge next to the title is the
      // single source of truth for the hidden-child count;
      // the user can click the title (or the note itself)
      // to drill in if they need to see the children. The
      // children array on `title` is still populated by the
      // counting loop above so that the badge value stays
      // correct.
    });
  } // end if (lines.length > 0)

  // Add note input row (inline, with file search suggest -
  // same style as todo's add-task)
  const addRow = container.createDiv({ cls: "dashboard-task-add" });
  const input = addRow.createEl("input", {
    cls: "dashboard-task-input",
    attr: { type: "text", placeholder: t("renderer.addNote") },
  });
  const fileSuggest = attachFileSuggest(input, app, (value, file) => {
    // Use `value` (the full input text after replacement,
    // e.g. "11[[En3]]") so leading text the user typed
    // before the wikilink is preserved. Previous code used
    // `file.path` which discarded everything before the
    // opener — "don't replace my content" requirement.
    callbacks.onProjectDocsAdd(card, value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && fileSuggest.tryPickSelection()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && input.value.trim()) {
      callbacks.onProjectDocsAdd(card, input.value.trim());
      input.value = "";
    }
  });
}

/**
 * Render a habit card body. The card type has a single
 * counter (streak) and an optional body line. This is a
 * read-only card — there are no add / edit / delete hooks.
 */
export function renderHabitBody(
  container: HTMLElement,
  card: DashboardCard,
): void {
  const streakEl = container.createDiv({ cls: "dashboard-habit-streak" });
  streakEl.createSpan({ cls: "dashboard-habit-icon", text: "🔥" });
  streakEl.createSpan({
    text: t("renderer.dayStreak", { count: card.streak }),
  });

  if (card.body) {
    container.createDiv({ cls: "dashboard-habit-body", text: card.body });
  }
}
