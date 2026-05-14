import { ItemView, WorkspaceLeaf } from 'obsidian';
import type DashboardPlugin from './main';
import type { DashboardData, DashboardCard } from './types';
import { SyncEngine } from './sync';
import { renderDashboard } from './renderer';
import { renderBanner, BannerEditModal } from './banner';
import { getRecentDocs, renderRecentDocs } from './recent';
import { renderQuickLinks, DocSearchModal } from './quick-links';
import { setupDragAndDrop } from './dnd';
import { CardEditModal } from './card-edit-modal';
import { t } from './i18n';

export const DASHBOARD_VIEW_TYPE = 'apex-dashboard-view';

const DESIRED_COLUMNS = [
	{ name: 'Memo', color: '#f59e0b' },
	{ name: 'Todo', color: '#6366f1' },
	{ name: 'Projects', color: '#10b981' },
	{ name: 'Library', color: '#8b5cf6' },
];

export class DashboardView extends ItemView {
	private plugin: DashboardPlugin;
	private sync: SyncEngine;
	private data: DashboardData | null = null;
	private cleanupFns: Array<() => void> = [];

	constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.sync = new SyncEngine(this.app, this.plugin.settings);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('main.dashboard');
	}

	getIcon(): string {
		return 'home';
	}

	async onOpen(): Promise<void> {
		this.sync.updateSettings(this.plugin.settings);
		this.sync.onDataUpdate((data) => this.render(data));

		await this.sync.init();
		await this.migrateColumns();
	}

	async onClose(): Promise<void> {
		this.runCleanup();
		this.sync.destroy();
	}

	async refresh(): Promise<void> {
		this.sync.updateSettings(this.plugin.settings);
		// Force re-render with current data using updated settings (theme, language, etc.)
		const data = this.sync.getData();
		if (data) {
			this.render(data);
		}
	}

	private async migrateColumns(): Promise<void> {
		const data = this.sync.getData();
		if (!data) return;

		const desiredNames = DESIRED_COLUMNS.map(c => c.name);

		const startsCorrectly = data.columns.length >= desiredNames.length
			&& desiredNames.every((name, i) => data.columns[i]?.name === name);

		if (startsCorrectly) return;

		const existingCards: Record<string, typeof data.columns[0]['cards']> = {};
		for (const col of data.columns) {
			existingCards[col.name] = col.cards;
		}

		const seen = new Set(desiredNames);
		const customColumns = data.columns.filter(
			col => !desiredNames.includes(col.name) && !seen.has(col.name) && seen.add(col.name),
		);

		const migrated: DashboardData = {
			...data,
			columns: [
				...DESIRED_COLUMNS.map(def => {
					const cards = existingCards[def.name] ?? [];
					return {
						...def,
						cards: cards.map(card => ({ ...card, column: def.name })),
					};
				}),
				...customColumns,
			],
		};

		await this.sync.replaceData(migrated);
	}

	private render(data: DashboardData): void {
		this.runCleanup();
		this.data = data;

		// Save scroll positions before re-render
		const root = this.containerEl.children[1] as HTMLElement;
		const kanbanEl = root?.querySelector('.dashboard-kanban');
		const sidebarEl = root?.querySelector('.dashboard-sidebar');
		const savedKanbanScroll = kanbanEl ? kanbanEl.scrollTop : 0;
		const savedSidebarScroll = sidebarEl ? sidebarEl.scrollTop : 0;

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('dashboard-root');
		container.setAttribute('data-theme', this.plugin.settings.stylePreset);

		renderBanner(
			container,
			data.banner,
			() => this.openBannerEditModal(data),
			this.app,
		);

		const mainLayout = container.createDiv({ cls: 'dashboard-main' });

		const sidebar = mainLayout.createDiv({ cls: 'dashboard-sidebar' });
		this.renderSidebar(sidebar);

		const kanban = mainLayout.createDiv({ cls: 'dashboard-kanban-wrapper' });
		renderDashboard(kanban, data, this.createCallbacks(), this.app);
		setupDragAndDrop(kanban, this.createCallbacks(), this.cleanupFns);

		// Restore scroll positions
		const newKanban = container.querySelector('.dashboard-kanban');
		const newSidebar = container.querySelector('.dashboard-sidebar');
		if (newKanban) newKanban.scrollTop = savedKanbanScroll;
		if (newSidebar) newSidebar.scrollTop = savedSidebarScroll;

	}

	private renderSidebar(sidebar: HTMLElement): void {
		if (!this.data) return;

		renderQuickLinks(
			sidebar,
			this.data.quickLinks,
			(path) => this.navigateToPath(path),
			(index) => this.sync.removeQuickLink(index),
			() => this.openQuickLinkModal(),
		);

		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(
			sidebar,
			docs,
			(path) => this.navigateToPath(path),
		);
	}

	private createCallbacks() {
		return {
			onCardEdit: (card: DashboardCard) => this.openCardEditModal(card),
			onCardDelete: (cardId: string) => this.sync.deleteCard(cardId),
			onCheckboxToggle: (cardId: string, idx: number, checked: boolean) => this.sync.toggleTask(cardId, idx, checked),
			onTaskAdd: (cardId: string, text: string) => this.sync.addTask(cardId, text),
			onTaskDelete: (cardId: string, idx: number) => this.sync.deleteTask(cardId, idx),
			onTaskReorder: (cardId: string, from: number, to: number) => this.sync.reorderTask(cardId, from, to),
			onTaskEdit: (cardId: string, idx: number, text: string) => this.sync.editTask(cardId, idx, text),
			onMemoUpdate: (card: DashboardCard, updates: { body: string; blockquote: string }) => this.sync.updateMemoCard(card.id, updates),
			onProjectDocsUpdate: (card: DashboardCard, docPaths: string[]) => this.sync.updateProjectDocs(card.id, docPaths),
			onProjectDocsReorder: (cardId: string, from: number, to: number) => this.sync.reorderDocPaths(cardId, from, to),
			onCardAdd: (colName: string) => {
				const lower = colName.toLowerCase();
				if (lower === 'memo' || lower === 'todo') {
					this.sync.addCard(colName);
				} else {
					this.openProjectSearchModal(colName);
				}
			},
			onColumnAdd: (name: string) => this.sync.addColumn(name),
			onBannerEdit: () => {
				if (this.data) this.openBannerEditModal(this.data);
			},
			onQuickLinkAdd: () => this.openQuickLinkModal(),
			onQuickLinkRemove: (index: number) => this.sync.removeQuickLink(index),
			onMoveCard: (cardId: string, targetCol: string, targetIdx: number) => this.sync.moveCard(cardId, targetCol, targetIdx),
			onMemoColorChange: (card: DashboardCard, color: string) => this.sync.updateMemoColor(card.id, color),
			onProjectCoverChange: (card: DashboardCard, imagePath: string) => this.sync.updateProjectCover(card.id, imagePath),
				onCardTitleEdit: (cardId: string, newTitle: string) => this.sync.updateCard(cardId, { title: newTitle }),
		};
	}

	private openBannerEditModal(data: DashboardData): void {
		const modal = new BannerEditModal(this.app, data.banner, (updates) => {
			this.sync.updateBanner(updates);
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openCardEditModal(card: DashboardCard): void {
		const modal = new CardEditModal(this.app, card, (updates) => {
			this.sync.updateCard(card.id, updates);
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openQuickLinkModal(): void {
		const modal = new DocSearchModal(this.app, (link) => {
			this.sync.addQuickLink(link);
		});
		modal.open();
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
		const name = prompt(t('renderer.sectionName'));
		if (name?.trim()) {
			this.sync.addColumn(name.trim());
		}
	}

	private async navigateToPath(path: string): Promise<void> {
		let file = this.app.vault.getFileByPath(path);
		if (!file && !path.endsWith('.md')) {
			file = this.app.vault.getFileByPath(`${path}.md`);
		}

		if (file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			return;
		}

		const folderPath = path.replace(/\/$/, '');
		const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
		if (abstractFile) {
			const leaves = this.app.workspace.getLeavesOfType('file-explorer');
			if (leaves.length > 0) {
				this.app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
			}
		}
	}

	private runCleanup(): void {
		for (const fn of this.cleanupFns) fn();
		this.cleanupFns = [];
	}
}
