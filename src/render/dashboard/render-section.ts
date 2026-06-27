/**
 * src/render/dashboard/render-section.ts
 *
 * Section / column renderer for the dashboard. The v1.5.0
 * refactor (Step 8.8.0B.4.3) split these helpers out of
 * `renderer.ts` so the column-level logic (header chrome,
 * section-type dropdown, auto-archive filter, "all cards
 * archived" placeholder) can evolve independently of the
 * per-card chrome (which lives in `./render-card.ts`).
 *
 * **Module surface**:
 *   - `renderSection`        — builds the full
 *     `.dashboard-section-row` DOM (header, action buttons,
 *     section-type dropdown, card grid) and wires the
 *     auto-archive filter.
 *   - `getSectionType`       — single source of truth for
 *     mapping a `DashboardColumn` to one of `"memo" /
 *     "todo" / "projects" / "notes" / "dashboard" / "library"
 *     / "todoplus"`.
 *   - `isCardAllCompleted`   — auto-archive filter predicate
 *     (regular task cards check `card.tasks`; todoplus cards
 *     re-resolve the source file).
 *
 * **Behaviour preservation**: function bodies are byte-for-byte
 * copies of the pre-refactor `renderer.ts:346-393` (the
 * `isCardAllCompleted` helper) and `renderer.ts:395-832` (the
 * `renderSection` function). Only the imports were rewritten
 * to point at the new sub-modules.
 *
 * **Why these are coupled**: `renderSection` is the only
 * caller of `renderCard` (from `./render-card.ts`), and the
 * `isCardAllCompleted` predicate is only used inside the
 * archive-filter loop. The three helpers live in the same
 * file because they share the section-type / column-shape
 * vocabulary.
 */
import { setIcon, type App } from "obsidian";
import { t } from "../../i18n";
import type {
  DashboardCard,
  DashboardColumn,
  DashboardData,
  RenderCallbacks,
  DashboardSettings,
} from "../../types";
import { showConfirmDialog } from "../../confirm-dialog";
import { renderLibrarySection } from "../../library-section";
import { renderColumnTitle, isColumnProtected } from "../section-title";
import {
  getCollapsedSections,
  saveCollapsedSections,
} from "./collapsed-state";
import {
  getTodoPlusSourceLinkFromTitle,
  resolveTodoPlusSlice,
} from "./card-bodies/todoplus";
import { openTodoPlusNoteSearchModal } from "./card-bodies/todoplus/modals";
import { renderCard } from "./render-card";

/**
 * Section-name → `sectionType` mapper. Returns one of:
 *   - `"memo"`     — column name `memo` (case-insensitive)
 *   - `"todo"`     — column name `todo`
 *   - `"projects"` — column name `projects`
 *   - `"notes"`    — column name `notes`
 *   - `"dashboard"`— column name `dashboard` OR a column that
 *                    contains only widget cards (chart /
 *                    weather / tracker)
 *   - `"library"`  — column name `library`
 *   - `"todoplus"` — column name `todo plus` / `todoplus` /
 *                    `待办plus` / `待办 plus`, or a column that
 *                    contains only `todoplus` cards
 *   - fallback: `"projects"`
 *
 * The explicit `column.sectionType` field wins when set, so
 * the user can override the inferred name with a frontmatter
 * line like `sectionType: memo` and the column will render
 * as a memo column even if its name is "My Notes".
 */
export function getSectionType(column: DashboardColumn): string {
  if (column.sectionType) return column.sectionType;
  const lower = column.name.toLowerCase();
  if (lower === "memo") return "memo";
  if (lower === "todo") return "todo";
  if (lower === "projects") return "projects";
  if (lower === "notes") return "notes";
  if (lower === "dashboard") return "dashboard";
  if (lower === "library") return "library";
  // TodoPlus: explicit section name "TodoPlus" / "待办Plus" / "todo plus" /
  // any time the column only contains `todoplus` cards.
  if (
    lower === "todoplus" ||
    lower === "todo plus" ||
    lower === "待办plus" ||
    lower === "待办 plus"
  )
    return "todoplus";
  if (column.cards.length > 0) {
    const types = new Set(column.cards.map((c) => c.type));
    const dashboardTypes = new Set(["chart", "weather", "tracker"]);
    if ([...types].every((t) => dashboardTypes.has(t)) && types.size > 0)
      return "dashboard";
    if (types.has("todoplus") && types.size === 1) return "todoplus";
    if (types.has("task") && types.size === 1) return "todo";
    if (types.has("task") && !types.has("project")) return "todo";
    if (types.has("project") && types.size === 1) return "projects";
    if (types.has("generic") && !types.has("project") && !types.has("task"))
      return "memo";
  }
  return "projects";
}

/**
 * Returns `true` when every task in `card` is checked. For
 * regular task cards the check is synchronous against the
 * in-memory `card.tasks` array. For todoplus cards the
 * check has to resolve the source file's heading slice —
 * async, with a single 200ms grace period if the metadata
 * cache hasn't indexed the file yet (cold-start path).
 *
 * Returns `false` for an empty task list (so the card is
 * NOT auto-archived before the user has had a chance to
 * write the first task).
 */
export async function isCardAllCompleted(
  card: DashboardCard,
  app: App,
): Promise<boolean> {
  // Regular Todo card: use the in-memory task list.
  if (card.type !== "todoplus") {
    if (!card.tasks || card.tasks.length === 0) return false;
    return card.tasks.every((t) => t.checked);
  }
  // TodoPlus card: parse the source file's heading slice.
  const sourceLink = getTodoPlusSourceLinkFromTitle(card);
  if (!sourceLink) return false;
  let slice = await resolveTodoPlusSlice(app, sourceLink);
  if (!slice) {
    // Cache may not have indexed the file yet (fresh workspace).
    // Give it one more chance.
    await new Promise<void>((r) => setTimeout(r, 200));
    slice = await resolveTodoPlusSlice(app, sourceLink);
  }
  if (!slice) return false;
  if (slice.items.length === 0) return false;
  return slice.items.every((it) => it.checked);
}

/**
 * Builds the full section row (`.dashboard-section-row`):
 *   - Header (title with rename + collapse toggle)
 *   - Action buttons (template, archive, type dropdown, +/delete)
 *   - For `library` sections: short-circuits into
 *     `renderLibrarySection` (no card grid)
 *   - For everything else: a `.dashboard-section-cards`
 *     container that calls `renderCard` for every card
 *     (after the auto-archive filter)
 *
 * The auto-archive filter (v1.4.6) drops fully-completed
 * cards from the render pass for todo / todoplus sections
 * with the section-level toggle on. The cards are NOT
 * deleted from `column.cards` — the filter is render-time
 * only, so flipping the archive button back off brings
 * them back.
 */
export async function renderSection(
  column: DashboardColumn,
  callbacks: RenderCallbacks,
  app: App,
  data?: DashboardData,
  settings?: DashboardSettings,
  sourcePath?: string,
): Promise<HTMLElement> {
  const el = document.createElement("div");
  el.addClass("dashboard-section-row");
  el.dataset.column = column.name;
  const sectionType = getSectionType(column);
  el.dataset.sectionType = sectionType;
  // v1.4.9 BUG-003a — diag: confirm renderSection actually runs and
  // with which section type / how many cards. Remove after verify.
  console.log(
    "[apex-dashboard][diag] renderSection column=",
    column.name,
    "sectionType=",
    sectionType,
    "cards=",
    column.cards.length,
    "cardTypes=",
    column.cards.map((c) => c.type).join(","),
  );

  const collapsed = getCollapsedSections();
  if (collapsed.has(column.name)) {
    el.addClass("dashboard-section-row--collapsed");
  }

  const header = el.createDiv({ cls: "dashboard-section-header" });

  const titleWrap = header.createDiv({ cls: "dashboard-section-title-wrap" });
  const toggle = titleWrap.createDiv({ cls: "dashboard-section-toggle" });
  toggle.setAttribute("role", "button");
  // Section name is rendered as a regular user-facing string — the
  // same way every other section name is displayed. We do NOT extract
  // a trailing number into a separate badge: a column called "library"
  // is just "library", a column called "121" is just "121", and a
  // column called "Project 5" is just "Project 5". Treating the name
  // as a label/tag would change its meaning from "name" to "id".
  const titleEl = titleWrap.createEl("h3", {
    cls: "dashboard-section-title",
  });
  renderColumnTitle(
    titleEl,
    column.name,
    app,
    sourcePath ?? app.workspace.getActiveFile()?.path ?? "",
  );

  titleEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    // When editing, present the full original column name so the user
    // can edit the whole string verbatim.
    const currentName = column.name;
    titleEl.empty();
    const input = titleEl.createEl("input", {
      cls: "dashboard-section-rename-input",
      attr: { type: "text", value: currentName },
    });
    input.focus();
    input.select();

    const finish = (save: boolean) => {
      const newName = input.value.trim();
      if (save && newName && newName !== currentName) {
        callbacks.onColumnRename(currentName, newName);
      } else {
        // Cancel path — restore the original column name verbatim.
        titleEl.empty();
        renderColumnTitle(
          titleEl,
          currentName,
          app,
          sourcePath ?? app.workspace.getActiveFile()?.path ?? "",
        );
      }
    };

    input.addEventListener("keydown", (ke: KeyboardEvent) => {
      if (ke.key === "Enter") {
        ke.preventDefault();
        finish(true);
      } else if (ke.key === "Escape") {
        ke.preventDefault();
        finish(false);
      }
    });

    input.addEventListener("blur", () => {
      finish(true);
    });
  });
  titleEl.style.cursor = "pointer";

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isNowCollapsed = el.hasClass("dashboard-section-row--collapsed");
    if (isNowCollapsed) {
      el.removeClass("dashboard-section-row--collapsed");
      collapsed.delete(column.name);
    } else {
      el.addClass("dashboard-section-row--collapsed");
      collapsed.add(column.name);
    }
    saveCollapsedSections(collapsed);
  });

  const headerActions = header.createDiv({
    cls: "dashboard-section-header-actions",
  });

  if (sectionType === "todo") {
    const templateBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: {},
    });
    setIcon(templateBtn, "layout-template");
    templateBtn.addEventListener("click", () =>
      callbacks.onAddFromTemplate(column.name),
    );
  }

  // Section-level "auto-archive completed cards" toggle for the
  // Todo and TodoPlus column variants. The v1.4.5 implementation
  // was a per-card "hide completed items" eye button (item-level
  // filter); v1.4.6 changed the semantic to card-level archive:
  // when ON, any card whose task list is fully checked disappears
  // from the dashboard entirely. The state is persisted in the
  // column's frontmatter via `archiveCompleted: bool` (the
  // callback `onColumnArchiveCompletedChange` writes through to
  // `SyncService.setColumnArchiveCompleted`). Default ON — when
  // the frontmatter key is absent, the column behaves as if
  // `archiveCompleted: true` is set, matching the user request
  // "默认开启". A non-task section type is ignored: the button
  // is not rendered for projects / memo / library.
  if (sectionType === "todo" || sectionType === "todoplus") {
    const columnArchive = column.archiveCompleted ?? true;
    const archiveBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn dashboard-section-archive-completed-btn",
      attr: { "aria-pressed": columnArchive ? "true" : "false" },
    });
    setIcon(archiveBtn, columnArchive ? "archive-restore" : "archive");
    if (columnArchive) {
      archiveBtn.addClass("dashboard-section-add-btn--active");
    }
    archiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onColumnArchiveCompletedChange(column.name, !columnArchive);
    });
  }

  // Library section: render differently
  if (sectionType === "library") {
    const configBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: {},
    });
    setIcon(configBtn, "settings");
    configBtn.addEventListener("click", () => {
      const event = new CustomEvent("dashboard-library-config", {
        detail: { columnName: column.name },
        bubbles: true,
      });
      el.dispatchEvent(event);
    });

    // Delete section button for library (hidden for protected columns)
    if (!isColumnProtected(column.name, data)) {
      const deleteSectionBtn = headerActions.createEl("button", {
        cls: "dashboard-section-add-btn dashboard-section-delete-btn",
        attr: {},
      });
      setIcon(deleteSectionBtn, "trash-2");
      deleteSectionBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmDialog(app, {
          title: t("common.confirmDelete"),
          message: t("renderer.deleteSectionConfirm", { column: column.name }),
        });
        if (confirmed) {
          callbacks.onColumnDelete(column.name);
        }
      });
    }

    renderLibrarySection(el, column, app, (config) => {
      callbacks.onLibraryConfigChange(column.name, config);
    });
    return el;
  }

  // Section type dropdown selector (memo / todo / projects / todoplus)
  const typeOptions = [
    { value: "memo", label: t("renderer.typeMemo"), icon: "sticky-note" },
    { value: "todo", label: t("renderer.typeTodo"), icon: "check-square" },
    {
      value: "projects",
      label: t("renderer.typeProjects"),
      icon: "folder-kanban",
    },
    {
      value: "todoplus",
      label: t("renderer.typeTodoPlus"),
      icon: "list-checks",
    },
  ];
  const currentType =
    sectionType === "notes"
      ? "projects"
      : sectionType === "dashboard"
        ? "projects"
        : sectionType;
  const currentTypeObj =
    typeOptions.find((o) => o.value === currentType) || typeOptions[2]!;

  const typeBtnWrapper = headerActions.createDiv({
    cls: "dashboard-section-type-wrapper",
  });
  const typeToggleBtn = typeBtnWrapper.createEl("button", {
    cls: "dashboard-section-add-btn dashboard-section-type-btn",
    attr: {},
  });
  setIcon(typeToggleBtn, currentTypeObj.icon as any);

  // Dropdown menu
  const typeDropdown = typeBtnWrapper.createDiv({
    cls: "dashboard-section-type-dropdown",
  });
  typeDropdown.style.display = "none";
  typeOptions.forEach((opt) => {
    const item = typeDropdown.createDiv({
      cls: "dashboard-section-type-dropdown-item",
    });
    if (opt.value === currentType) item.addClass("active");
    const iconSpan = item.createSpan({
      cls: "dashboard-section-type-dropdown-icon",
    });
    setIcon(iconSpan, opt.icon as any);
    item.createSpan({ text: opt.label });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (opt.value !== currentType) {
        callbacks.onColumnSectionTypeChange(column.name, opt.value);
      }
      typeDropdown.style.display = "none";
    });
  });

  typeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = typeDropdown.style.display === "block";
    typeDropdown.style.display = isOpen ? "none" : "block";
  });

  // Close dropdown when clicking outside
  document.addEventListener(
    "click",
    () => {
      typeDropdown.style.display = "none";
    },
    { once: false },
  );

  // Add card button. The UX differs per section kind:
  //   - projects: inline text input (a free-form group label, e.g.
  //     "Q4-roadmap"). Collected and forwarded to
  //     `callbacks.onProjectGroupAdd`.
  //   - todoplus: opens the `DocSearchModal` so the user filters
  //     vault notes by name/path and picks one. The picked note
  //     becomes the source — we auto-create `## To-do` in it if
  //     missing and add a `[[note#To-do]]` mirror card. We no
  //     longer require the user to type a wikilink-form string
  //     by hand.
  //   - everything else: simple click → `callbacks.onCardAdd`.
  const addCardSectionType = getSectionType(column);
  const isProjectSection = addCardSectionType === "projects";
  const isTodoPlusSection = addCardSectionType === "todoplus";
  if (isTodoPlusSection) {
    // Note-search UX. We piggy-back on the existing project
    // `DocSearchModal` (substring filter over vault file
    // basenames / paths; max 20 hits) — the user types to
    // narrow the candidate set, then clicks the result they
    // want. The picked `TFile` is the mirror target.
    const addCardBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: {},
    });
    setIcon(addCardBtn, "plus");
    addCardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTodoPlusNoteSearchModal(column, callbacks, app);
    });
  } else if (isProjectSection) {
    let addInputVisible = false;
    let addInputEl: HTMLInputElement | null = null;

    const addCardBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: {},
    });
    setIcon(addCardBtn, "plus");
    addCardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (addInputVisible && addInputEl) {
        addInputEl.focus();
        return;
      }
      addInputVisible = true;
      // Remove existing input if any
      const existing = addCardBtn.parentElement!.querySelector(
        ".dashboard-section-add-input",
      );
      if (existing) existing.remove();

      const wrapper = addCardBtn.parentElement!.createDiv({
        cls: "dashboard-section-add-input",
      });
      addInputEl = wrapper.createEl("input", {
        cls: "dashboard-task-input",
        attr: {
          type: "text",
          placeholder: t("renderer.addGroup"),
        },
      });
      addInputEl.focus();

      const finishAdd = () => {
        const val = addInputEl?.value.trim();
        if (val) {
          callbacks.onProjectGroupAdd(column.name, val);
        }
        wrapper.remove();
        addInputVisible = false;
        addInputEl = null;
      };

      addInputEl.addEventListener("keydown", (ke: KeyboardEvent) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          finishAdd();
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          wrapper.remove();
          addInputVisible = false;
          addInputEl = null;
        }
      });
      addInputEl.addEventListener("blur", () => {
        setTimeout(finishAdd, 100);
      });
    });
  } else {
    const addCardBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn",
      attr: {},
    });
    setIcon(addCardBtn, "plus");
    addCardBtn.addEventListener("click", () =>
      callbacks.onCardAdd(column.name),
    );
  }

  // Delete section button (hidden for protected columns)
  if (!isColumnProtected(column.name, data)) {
    const deleteSectionBtn = headerActions.createEl("button", {
      cls: "dashboard-section-add-btn dashboard-section-delete-btn",
      attr: {},
    });
    setIcon(deleteSectionBtn, "trash-2");
    deleteSectionBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirmDialog(app, {
        title: t("common.confirmDelete"),
        message: t("renderer.deleteSectionConfirm", { column: column.name }),
      });
      if (confirmed) {
        callbacks.onColumnDelete(column.name);
      }
    });
  }

  const cardsContainer = el.createDiv({ cls: "dashboard-section-cards" });

  // v1.4.6 auto-archive filter: for todo / todoplus columns with
  // the section-level archive toggle enabled (default true), drop
  // any card whose task list is fully checked. The check is async
  // for todoplus cards (we have to read the source file) and sync
  // for regular task cards.
  const archiveEnabled =
    (sectionType === "todo" || sectionType === "todoplus") &&
    (column.archiveCompleted ?? true);

  for (const card of column.cards) {
    try {
      if (archiveEnabled) {
        const allDone = await isCardAllCompleted(card, app);
        if (allDone) {
          // Skip rendering — the card is "archived". The card is
          // NOT deleted from `column.cards` in the underlying
          // data; this filter is a render-time concern only, so
          // the user can flip the archive button back off and
          // see the card again.
          continue;
        }
      }
      const cardEl = renderCard(
        card,
        column.name,
        sectionType,
        callbacks,
        app,
        data,
        settings,
        sourcePath,
      );
      cardsContainer.appendChild(cardEl);
    } catch {}
  }

  // When ALL cards in the column are archived, show a small
  // placeholder so the user has feedback that the section isn't
  // empty by accident — the placeholder is muted and a single
  // line, no button or interaction. The user can flip the archive
  // button in the header to see the cards again.
  if (archiveEnabled && cardsContainer.children.length === 0) {
    const archivedAll = cardsContainer.createDiv({
      cls: "dashboard-section-archived-empty",
    });
    archivedAll.setText(t("renderer.allCardsArchived"));
  }

  return el;
}
