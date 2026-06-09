import { Modal, App, Setting, setIcon } from "obsidian";
import type { LibraryConfig, PropertyFilter, LibraryViewMode } from "./types";
import { extractFrontmatterProperties } from "./library-section";
import { t } from "./i18n";

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
        this.config = { ...existingConfig, filters: existingConfig.filters.map(f => ({ ...f, values: [...f.values] })) };
        this.onSave = onSave;
        this.filters = this.config.filters.map(f => ({ ...f, values: [...f.values] }));
        this.availableProperties = extractFrontmatterProperties(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("dashboard-library-config-modal");

        // Title
        contentEl.createEl("h2", { text: t("library.configTitle"), cls: "dashboard-library-config-title" });

        // --- Filters Section ---
        const filtersSection = contentEl.createDiv({ cls: "dashboard-library-config-section" });
        filtersSection.createEl("h3", { text: t("library.property"), cls: "dashboard-library-config-section-title" });

        const filtersContainer = filtersSection.createDiv({ cls: "dashboard-library-config-filters" });

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
                const filterRow = filtersContainer.createDiv({ cls: "dashboard-library-config-filter-row" });

                // Property selector
                const propSelect = filterRow.createEl("select", { cls: "dropdown" });
                const propKeys = Array.from(this.availableProperties.keys());
                for (const key of propKeys) {
                    const option = propSelect.createEl("option", { text: key, attr: { value: key } });
                    if (key === filter.property) option.selected = true;
                }
                propSelect.addEventListener("change", () => {
                    filter.property = propSelect.value;
                    filter.values = [];
                });

                // Value input (comma-separated)
                const valueInput = filterRow.createEl("input", {
                    cls: "dashboard-library-config-value-input",
                    attr: { type: "text", placeholder: t("library.filterValues") },
                });
                valueInput.value = filter.values.join(", ");
                valueInput.addEventListener("input", () => {
                    filter.values = valueInput.value
                        .split(",")
                        .map(s => s.trim())
                        .filter(Boolean);
                });

                // Remove button
                const removeBtn = filterRow.createDiv({ cls: "dashboard-library-config-remove-btn" });
                setIcon(removeBtn, "trash-2");
                removeBtn.title = t("library.removeFilter");
                removeBtn.addEventListener("click", () => {
                    this.filters.splice(i, 1);
                    renderFilters();
                });
            }

            // Add filter button
            const addBtn = filtersContainer.createDiv({ cls: "dashboard-library-config-add-btn" });
            setIcon(addBtn, "plus");
            addBtn.createSpan({ text: t("library.addFilter") });
            addBtn.addEventListener("click", () => {
                const firstProp = Array.from(this.availableProperties.keys())[0] ?? "tags";
                this.filters.push({ property: firstProp, values: [] });
                renderFilters();
            });
        };

        renderFilters();

        // --- View Mode ---
        const viewSection = contentEl.createDiv({ cls: "dashboard-library-config-section" });
        viewSection.createEl("h3", { text: t("library.viewGrid"), cls: "dashboard-library-config-section-title" });

        const viewModes: LibraryViewMode[] = ["grid", "list", "table", "kanban"];
        const viewIcons: Record<string, string> = { grid: "layout-grid", list: "list", table: "table", kanban: "columns" };
        const viewLabels: Record<string, string> = {
            grid: t("library.viewGrid"),
            list: t("library.viewList"),
            table: t("library.viewTable"),
            kanban: t("library.viewKanban"),
        };

        const viewToggle = viewSection.createDiv({ cls: "dashboard-library-config-view-toggle" });
        for (const mode of viewModes) {
            const btn = viewToggle.createDiv({
                cls: "dashboard-library-config-view-btn" + (mode === this.config.viewMode ? " active" : ""),
            });
            setIcon(btn, viewIcons[mode] ?? "file");
            btn.createSpan({ text: viewLabels[mode] ?? mode });
            btn.addEventListener("click", () => {
                viewToggle.querySelectorAll(".dashboard-library-config-view-btn").forEach(b => b.removeClass("active"));
                btn.addClass("active");
                this.config.viewMode = mode;
            });
        }

        // --- Kanban Group By (only when kanban is selected) ---
        const kanbanSection = viewSection.createDiv({ cls: "dashboard-library-config-kanban-section" });
        const updateKanbanVisibility = () => {
            kanbanSection.style.display = this.config.viewMode === "kanban" ? "" : "none";
        };
        updateKanbanVisibility();

        // Re-check visibility when view mode changes
        viewToggle.addEventListener("click", () => {
            setTimeout(updateKanbanVisibility, 50);
        });

        new Setting(kanbanSection)
            .setName(t("library.kanbanGroupBy"))
            .addDropdown(dropdown => {
                dropdown.addOption("", t("library.noGroup"));
                const propKeys = Array.from(this.availableProperties.keys());
                for (const key of propKeys) {
                    dropdown.addOption(key, key);
                }
                dropdown.setValue(this.config.kanbanGroupBy ?? "");
                dropdown.onChange(value => {
                    this.config.kanbanGroupBy = value || undefined;
                });
            });

        // --- Sort ---
        const sortSection = contentEl.createDiv({ cls: "dashboard-library-config-section" });
        sortSection.createEl("h3", { text: t("library.sortName"), cls: "dashboard-library-config-section-title" });

        new Setting(sortSection)
            .setName(t("library.sortName"))
            .addDropdown(dropdown => {
                dropdown.addOption("name", t("library.sortName"));
                dropdown.addOption("modified", t("library.sortModified"));
                dropdown.addOption("created", t("library.sortCreated"));
                const propKeys = Array.from(this.availableProperties.keys()).filter(
                    k => k !== "tags" && k !== "modified" && k !== "created" && k !== "path"
                );
                for (const key of propKeys) {
                    dropdown.addOption(key, key);
                }
                dropdown.setValue(this.config.sortBy);
                dropdown.onChange(value => {
                    this.config.sortBy = value;
                });
            });

        new Setting(sortSection)
            .setName(t("library.sortModified"))
            .addToggle(toggle => {
                toggle.setValue(this.config.sortDesc);
                toggle.onChange(value => {
                    this.config.sortDesc = value;
                });
            });

        // --- Page Size ---
        const pageSection = contentEl.createDiv({ cls: "dashboard-library-config-section" });
        pageSection.createEl("h3", { text: t("library.pageSize", { count: "" }).trim(), cls: "dashboard-library-config-section-title" });

        new Setting(pageSection)
            .setName(t("library.pageSize", { count: "" }).trim())
            .addDropdown(dropdown => {
                dropdown.addOption("10", t("library.pageSize", { count: 10 }));
                dropdown.addOption("20", t("library.pageSize", { count: 20 }));
                dropdown.addOption("50", t("library.pageSize", { count: 50 }));
                dropdown.setValue(String(this.config.pageSize ?? 20));
                dropdown.onChange(value => {
                    this.config.pageSize = parseInt(value) || 20;
                });
            });

        // --- Buttons ---
        const buttonRow = contentEl.createDiv({ cls: "dashboard-library-config-buttons" });

        const cancelBtn = buttonRow.createEl("button", { text: t("common.cancel") });
        cancelBtn.addEventListener("click", () => this.close());

        const saveBtn = buttonRow.createEl("button", { text: t("common.save"), cls: "mod-cta" });
        saveBtn.addEventListener("click", () => {
            // Update config filters from our working copy
            this.config.filters = this.filters.filter(f => f.values.length > 0 || f.property);
            this.onSave({ ...this.config });
            this.close();
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
