import { Modal, App, Setting, setIcon } from "obsidian";
import type { LibraryConfig, PropertyFilter, LibraryViewMode } from "./types";
import { extractFrontmatterProperties } from "./library-section";
import { t } from "./i18n";

// Map internal property keys to user-facing display names (using Obsidian base property naming)
const BUILTIN_PROPERTY_NAMES: Record<string, string> = {
  tags: t("library.tags"),
  modified: t("library.modified"),
  created: t("library.created"),
  path: t("library.path"),
  name: t("library.sortName"),
};

/** Get display name for a property key */
function getPropertyName(key: string): string {
  return BUILTIN_PROPERTY_NAMES[key] ?? key;
}

export class LibraryConfigModal extends Modal {
  private config: LibraryConfig;
  private onSave: (config: LibraryConfig) => void;
  private filters: PropertyFilter[];
  private availableProperties: Map<string, Set<string>>;

  constructor(
    app: App,
    existingConfig: LibraryConfig,
    onSave: (config: LibraryConfig) => void,
  ) {
    super(app);
    this.config = {
      ...existingConfig,
      filters: existingConfig.filters.map((f) => ({
        ...f,
        values: [...f.values],
      })),
    };
    this.onSave = onSave;
    this.filters = this.config.filters.map((f) => ({
      ...f,
      values: [...f.values],
    }));
    this.availableProperties = extractFrontmatterProperties(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dashboard-library-config-modal");

    // Title
    contentEl.createEl("h2", {
      text: t("library.configTitle"),
      cls: "dashboard-library-config-title",
    });

    // --- Filters Section ---
    const filtersSection = contentEl.createDiv({
      cls: "dashboard-library-config-section",
    });
    filtersSection.createEl("h3", {
      text: t("library.property"),
      cls: "dashboard-library-config-section-title",
    });

    const filtersContainer = filtersSection.createDiv({
      cls: "dashboard-library-config-filters",
    });

    const renderFilters = () => {
      filtersContainer.empty();

      if (this.filters.length === 0) {
        filtersContainer.createDiv({
          cls: "dashboard-library-config-empty",
          text: t("library.noFiles"),
        });
      }

      for (let i = 0; i < this.filters.length; i++) {
        const filter = this.filters[i];
        const filterRow = filtersContainer.createDiv({
          cls: "dashboard-library-config-filter-row",
        });

        // Property selector — use custom class instead of Obsidian's "dropdown" (avoids diamond icon bug)
        const propSelect = filterRow.createEl("select", {
          cls: "dashboard-library-config-prop-select",
        });
        const propKeys = Array.from(this.availableProperties.keys());
        for (const key of propKeys) {
          const option = propSelect.createEl("option", {
            text: getPropertyName(key),
            attr: { value: key },
          });
          if (key === filter.property) option.selected = true;
        }
        propSelect.addEventListener("change", () => {
          filter.property = propSelect.value;
          filter.values = [];
          renderFilters(); // re-render to update placeholder
        });

        // Value input (comma-separated)
        const valueInput = filterRow.createEl("input", {
          cls: "dashboard-library-config-value-input",
          attr: {
            type: "text",
            placeholder: `[${getPropertyName(filter.property)}]`,
          },
        });
        valueInput.value = filter.values.join(", ");
        valueInput.addEventListener("input", () => {
          filter.values = valueInput.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        });

        // Remove button
        const removeBtn = filterRow.createDiv({
          cls: "dashboard-library-config-remove-btn",
        });
        setIcon(removeBtn, "trash-2");
        removeBtn.title = t("library.removeFilter");
        removeBtn.addEventListener("click", () => {
          this.filters.splice(i, 1);
          renderFilters();
        });
      }

      // Add filter button
      const addBtn = filtersContainer.createDiv({
        cls: "dashboard-library-config-add-btn",
      });
      setIcon(addBtn, "plus");
      addBtn.createSpan({ text: t("library.addFilter") });
      addBtn.addEventListener("click", () => {
        const firstProp =
          Array.from(this.availableProperties.keys())[0] ?? "tags";
        this.filters.push({ property: firstProp, values: [] });
        renderFilters();
      });
    };

    renderFilters();

    // --- Quick Date Filter (compact inline row) ---
    const dateFilterRow = filtersContainer.createDiv({
      cls: "dashboard-library-config-filter-row",
    });

    const datePropSelect = dateFilterRow.createEl("select", {
      cls: "dashboard-library-config-prop-select",
    });
    datePropSelect.createEl("option", {
      text: getPropertyName("created"),
      value: "created",
    });
    datePropSelect.createEl("option", {
      text: getPropertyName("modified"),
      value: "modified",
    });
    datePropSelect.value = this.config.quickDateFilter?.property ?? "created";

    const dateRangeWrap = dateFilterRow.createDiv({
      cls: "dashboard-library-config-date-range",
    });
    const startDateInput = dateRangeWrap.createEl("input", {
      cls: "dashboard-library-config-date-input",
      attr: { type: "date", placeholder: t("library.dateStart") },
    });
    const endDateInput = dateRangeWrap.createEl("input", {
      cls: "dashboard-library-config-date-input",
      attr: { type: "date", placeholder: t("library.dateEnd") },
    });

    if (this.config.quickDateFilter) {
      startDateInput.value = this.config.quickDateFilter.start;
      endDateInput.value = this.config.quickDateFilter.end;
    }

    const syncQuickDateFilter = () => {
      const start = startDateInput.value;
      const end = endDateInput.value;
      if (start || end) {
        this.config.quickDateFilter = {
          property:
            (datePropSelect.value as "created" | "modified") ?? "created",
          start,
          end,
        };
      } else {
        this.config.quickDateFilter = undefined;
      }
    };
    datePropSelect.addEventListener("change", syncQuickDateFilter);
    startDateInput.addEventListener("change", syncQuickDateFilter);
    endDateInput.addEventListener("change", syncQuickDateFilter);

    // --- View Mode ---
    const viewSection = contentEl.createDiv({
      cls: "dashboard-library-config-section",
    });
    viewSection.createEl("h3", {
      text: t("library.viewMode"),
      cls: "dashboard-library-config-section-title",
    });

    const viewModes: LibraryViewMode[] = ["grid", "list", "table", "kanban"];
    const viewIcons: Record<string, string> = {
      grid: "layout-grid",
      list: "list",
      table: "table",
      kanban: "columns",
    };
    const viewLabels: Record<string, string> = {
      grid: t("library.viewGrid"),
      list: t("library.viewList"),
      table: t("library.viewTable"),
      kanban: t("library.viewKanban"),
    };

    const viewToggle = viewSection.createDiv({
      cls: "dashboard-library-config-view-toggle",
    });
    for (const mode of viewModes) {
      const btn = viewToggle.createDiv({
        cls:
          "dashboard-library-config-view-btn" +
          (mode === this.config.viewMode ? " active" : ""),
      });
      setIcon(btn, viewIcons[mode] ?? "file");
      btn.createSpan({ text: viewLabels[mode] ?? mode });
      btn.addEventListener("click", () => {
        viewToggle
          .querySelectorAll(".dashboard-library-config-view-btn")
          .forEach((b) => b.removeClass("active"));
        btn.addClass("active");
        this.config.viewMode = mode;
      });
    }

    // --- Kanban Group By (only when kanban is selected) ---
    const kanbanSection = viewSection.createDiv({
      cls: "dashboard-library-config-kanban-section",
    });
    const updateKanbanVisibility = () => {
      kanbanSection.style.display =
        this.config.viewMode === "kanban" ? "" : "none";
    };
    updateKanbanVisibility();

    viewToggle.addEventListener("click", () => {
      setTimeout(updateKanbanVisibility, 50);
    });

    new Setting(kanbanSection)
      .setName(t("library.kanbanGroupBy"))
      .addDropdown((dropdown) => {
        dropdown.addOption("", t("library.noGroup"));
        const propKeys = Array.from(this.availableProperties.keys());
        for (const key of propKeys) {
          dropdown.addOption(key, getPropertyName(key));
        }
        dropdown.setValue(this.config.kanbanGroupBy ?? "");
        dropdown.onChange((value) => {
          this.config.kanbanGroupBy = value || undefined;
        });
      });

    // --- Visible Properties (only when table or list is selected) ---
    // Built-in pseudo-properties (always available) + dynamic frontmatter keys
    const builtinProps = ["name", "modified", "created"];
    const allPropKeys = [
      ...builtinProps,
      ...Array.from(this.availableProperties.keys()).filter(
        (k) => !builtinProps.includes(k),
      ),
    ];

    // Working copy of visibleProperties (undefined = "use all" / not configured yet)
    let workingVisibleProps: Set<string> | null = this.config.visibleProperties
      ? new Set(this.config.visibleProperties)
      : null;

    const visiblePropsSection = contentEl.createDiv({
      cls: "dashboard-library-config-section",
    });
    visiblePropsSection.createEl("h3", {
      text: t("library.visibleProperties"),
      cls: "dashboard-library-config-section-title",
    });
    visiblePropsSection.createEl("p", {
      text: t("library.visiblePropertiesDesc"),
      cls: "dashboard-library-config-section-desc",
    });

    const visiblePropsList = visiblePropsSection.createDiv({
      cls: "dashboard-library-config-visible-props",
    });
    const visiblePropsActions = visiblePropsSection.createDiv({
      cls: "dashboard-library-config-visible-props-actions",
    });

    const renderVisibleProps = () => {
      visiblePropsList.empty();
      // If null (not configured) → all checked
      const isChecked = (key: string) =>
        workingVisibleProps === null ? true : workingVisibleProps.has(key);

      for (const key of allPropKeys) {
        const row = visiblePropsList.createDiv({
          cls: "dashboard-library-config-visible-props-row",
        });
        const cb = row.createEl("input", {
          attr: { type: "checkbox" },
        });
        cb.checked = isChecked(key);
        cb.id = `dashboard-visible-props-${key}`;
        const label = row.createEl("label", {
          text: getPropertyName(key),
          attr: { for: `dashboard-visible-props-${key}` },
        });
        cb.addEventListener("change", () => {
          // Lazy-init set on first interaction
          if (workingVisibleProps === null) {
            workingVisibleProps = new Set(allPropKeys);
          }
          if (cb.checked) {
            workingVisibleProps.add(key);
          } else {
            workingVisibleProps.delete(key);
          }
          // Re-render to reflect "Show all" / "Deselect all" action labels
          renderVisibleProps();
        });
      }

      // Actions row
      visiblePropsActions.empty();
      const allChecked = workingVisibleProps
        ? workingVisibleProps.size === allPropKeys.length
        : true;
      const noneChecked = workingVisibleProps
        ? workingVisibleProps.size === 0
        : false;

      const selectAllBtn = visiblePropsActions.createEl("button", {
        text: t("library.showAll"),
        cls: "dashboard-library-config-visible-props-action",
      });
      selectAllBtn.disabled = allChecked;
      selectAllBtn.addEventListener("click", () => {
        workingVisibleProps = new Set(allPropKeys);
        renderVisibleProps();
      });

      const deselectAllBtn = visiblePropsActions.createEl("button", {
        text: t("library.deselectAll"),
        cls: "dashboard-library-config-visible-props-action",
      });
      deselectAllBtn.disabled = noneChecked;
      deselectAllBtn.addEventListener("click", () => {
        workingVisibleProps = new Set();
        renderVisibleProps();
      });
    };

    const updateVisiblePropsVisibility = () => {
      const show =
        this.config.viewMode === "table" || this.config.viewMode === "list";
      visiblePropsSection.style.display = show ? "" : "none";
    };
    updateVisiblePropsVisibility();
    renderVisibleProps();
    viewToggle.addEventListener("click", () => {
      setTimeout(() => {
        updateKanbanVisibility();
        updateVisiblePropsVisibility();
      }, 50);
    });

    // --- Sort & Page Size (compact, no section headers) ---
    const sortPageSection = contentEl.createDiv({
      cls: "dashboard-library-config-section",
    });

    new Setting(sortPageSection)
      .setName(t("library.sortBy"))
      .addDropdown((dropdown) => {
        dropdown.addOption("name", getPropertyName("name"));
        dropdown.addOption("modified", getPropertyName("modified"));
        dropdown.addOption("created", getPropertyName("created"));
        const propKeys = Array.from(this.availableProperties.keys()).filter(
          (k) =>
            k !== "tags" && k !== "modified" && k !== "created" && k !== "path",
        );
        for (const key of propKeys) {
          dropdown.addOption(key, getPropertyName(key));
        }
        dropdown.setValue(this.config.sortBy);
        dropdown.onChange((value) => {
          this.config.sortBy = value;
        });
      });

    new Setting(sortPageSection)
      .setName(t("library.sortDirection"))
      .addToggle((toggle) => {
        toggle.setValue(this.config.sortDesc);
        toggle.onChange((value) => {
          this.config.sortDesc = value;
        });
      });

    new Setting(sortPageSection)
      .setName(t("library.pageSize", { count: "" }).trim())
      .addDropdown((dropdown) => {
        dropdown.addOption("10", t("library.pageSize", { count: 10 }));
        dropdown.addOption("20", t("library.pageSize", { count: 20 }));
        dropdown.addOption("50", t("library.pageSize", { count: 50 }));
        dropdown.setValue(String(this.config.pageSize ?? 20));
        dropdown.onChange((value) => {
          this.config.pageSize = parseInt(value) || 20;
        });
      });

    // --- Buttons ---
    const buttonRow = contentEl.createDiv({
      cls: "dashboard-library-config-buttons",
    });

    const cancelBtn = buttonRow.createEl("button", {
      text: t("common.cancel"),
    });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonRow.createEl("button", {
      text: t("common.save"),
      cls: "mod-cta",
    });
    saveBtn.addEventListener("click", () => {
      // Update config filters from our working copy
      this.config.filters = this.filters.filter(
        (f) => f.values.length > 0 || f.property,
      );
      // Sync visibleProperties (only persist for table/list views; null = "show all")
      if (this.config.viewMode === "table" || this.config.viewMode === "list") {
        if (workingVisibleProps === null) {
          // Undefined in UI = "show all" — store as undefined (backward-compatible)
          this.config.visibleProperties = undefined;
        } else {
          // Preserve user-chosen order
          this.config.visibleProperties = allPropKeys.filter((k) =>
            workingVisibleProps!.has(k),
          );
        }
      } else {
        // Other view modes don't need visibleProperties
        this.config.visibleProperties = undefined;
      }
      this.onSave({ ...this.config });
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
