import { ItemView, WorkspaceLeaf, setIcon, Notice, TFile } from 'obsidian';
import type DashboardPlugin from './main';
import type { DashboardData, DashboardCard } from './types';
import { SyncEngine } from './sync';
import { renderSidebarWidgets, renderSidebarWeekCalendar, renderDashboard, renderSidebarPomodoro, renderSidebarReading } from './renderer';
import { loadHolidayData, renderSidebarLunarWidget } from './lunar-widget';
import { t } from './i18n';
import type { HolidayInfo } from './holiday-service';
import { PomodoroService } from './pomodoro-service';
import { ReadingService } from './reading-service';
import { parse as parseMarkdown, serialize } from './parser';

export const SIDEBAR_VIEW_TYPE = 'apex-dashboard-sidebar';

export class SidebarView extends ItemView {
	private plugin: DashboardPlugin;
	private sync: SyncEngine;
	private data: DashboardData | null = null;
	private cleanupFns: Array<() => void> = [];
	private holidayData: Record<string, HolidayInfo> = {};
	private pomodoroService: PomodoroService | null = null;
	private readingService: ReadingService | null = null;

	/** Overlay mode: path of the note currently overlaid with kanban */
	private overlayNotePath: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.sync = new SyncEngine(this.app, plugin.settings);
	}

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('sidebar.viewName');
	}

	getIcon(): string {
		return 'layoutDashboard';
	}

	async onOpen(): Promise<void> {
		this.sync.updateSettings(this.plugin.settings);
		this.sync.onDataUpdate((data) => {
			this.data = data;
			this.render();
		});
		await this.sync.init();

		this.pomodoroService = new PomodoroService(this.plugin);
		this.readingService = new ReadingService(this.plugin);

		this.holidayData = await loadHolidayData();
	}

	onResize(): void {
		this.render();
	}

	async onClose(): Promise<void> {
		this.sync.destroy();
		for (const fn of this.cleanupFns) {
			fn?.();
		}
	}

	render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();

		if (this.overlayNotePath) {
			this.renderOverlayMode(container);
			return;
		}

		const wrapper = container.createDiv({ cls: 'apex-dashboard-sidebar' });

		// Header with icon and title
		const header = wrapper.createDiv({ cls: 'sidebar-header' });
		header.createEl('h3', { text: t('sidebar.viewName') });

		renderSidebarWidgets(wrapper, this.plugin.settings, this.app, this.pomodoroService ?? undefined, this.readingService ?? undefined);
		renderSidebarLunarWidget(wrapper, this.holidayData, this.app);
		if (this.pomodoroService) renderSidebarPomodoro(wrapper, this.pomodoroService, this.plugin.settings);
		if (this.readingService) renderSidebarReading(wrapper, this.readingService);
		renderSidebarWeekCalendar(wrapper);

		if (this.data) {
			renderDashboard(wrapper, this.data, this.createMainCallbacks(), this.app, this.plugin.settings);
		} else {
			wrapper.createEl('p', { cls: 'sidebar-empty', text: t('sidebar.noData') });
		}
	}

	/**
	 * Called by the plugin when the user activates "add dashboard to note".
	 * Parses the note's markdown content directly to build dashboard columns.
	 */
	async showOverlayForNote(notePath: string): Promise<void> {
		this.overlayNotePath = notePath;

		// Read and parse the note's content directly
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
			new Notice('Cannot read this file as markdown');
			this.exitOverlayMode();
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			const parsedData = parseMarkdown(content);

			// If note has columns defined, use them directly
			if (parsedData.columns && parsedData.columns.length > 0) {
				this.data = parsedData;
				new Notice(t('sidebar.overlayActive', { note: notePath.split('/').pop() ?? '' }));
			} else {
				// No columns defined, exit overlay mode
				new Notice('This note has no dashboard columns. Run "Convert Note Headings to Dashboard Columns" first.');
				this.exitOverlayMode();
				return;
			}
		} catch (err) {
			console.error('[apex-dashboard] Error parsing note for overlay:', err);
			new Notice('Error reading note content');
			this.exitOverlayMode();
			return;
		}

		this.render();
	}

	private renderOverlayMode(container: HTMLElement): void {
		container.addClass('apex-dashboard-overlay-root');

		const overlayEl = container.createDiv({ cls: 'dashboard-overlay' });

		// Header
		const header = overlayEl.createDiv({ cls: 'dashboard-overlay-header' });
		header.createEl('span', {
			cls: 'dashboard-overlay-title',
			text: t('sidebar.overlayTitle', { note: this.overlayNotePath?.split('/').pop() ?? '' }),
		});

		// Exit button
		const exitBtn = header.createEl('button', { cls: 'dashboard-overlay-exit-btn' });
		setIcon(exitBtn, 'x');
		exitBtn.title = t('sidebar.exitOverlay');
		exitBtn.addEventListener('click', () => this.exitOverlayMode());

		// Kanban columns - use parsed data from the note
		const kanban = overlayEl.createDiv({ cls: 'dashboard-overlay-kanban' });

		if (this.data && this.data.columns.length > 0) {
			const noteData: DashboardData = {
				banner: this.data.banner,
				quickActions: this.data.quickActions ?? [],
				columns: this.data.columns,
			};
			renderDashboard(kanban, noteData, this.createOverlayCallbacks(), this.app, this.plugin.settings);
		} else {
			kanban.createEl('p', { text: 'No columns defined in this note' });
		}
	}

	/** Create callbacks for main sidebar (read-only, delegates to main dashboard) */
	private createMainCallbacks() {
		return {
			onCardEdit: (card: DashboardCard) => {
				this.plugin.refreshAllDashboards();
			},
			onCardDelete: async () => {},
			onCheckboxToggle: () => {
				this.plugin.refreshAllDashboards();
			},
			onTaskAdd: () => {
				this.plugin.refreshAllDashboards();
			},
			onTaskDelete: async () => {},
			onTaskReorder: () => {},
			onTaskMoveToCard: () => {},
			onTaskEdit: () => {
				this.plugin.refreshAllDashboards();
			},
			onCardAdd: () => {},
			onColumnAdd: () => {},
			onBannerEdit: () => {},
			onQuickActionAdd: () => {},
			onQuickActionRemove: () => {},
			onMoveCard: () => {},
			onMemoUpdate: () => {},
			onProjectDocsUpdate: () => {},
			onProjectDocsReorder: () => {},
			onDocMoveToCard: () => {},
			onProjectDocsAdd: () => {},
			onProjectDocsRemove: () => {},
			onMemoColorChange: () => {},
			onProjectCoverChange: () => {},
			onCardTitleEdit: () => {},
			onCardWidthChange: () => {},
			onCardSizeChange: () => {},
			onCardGridChange: () => {},
			onCardGridMove: () => {},
			onFileDrop: () => {},
			onProjectItemReorder: () => {},
			onProjectItemMoveToCard: () => {},
			onColumnRename: () => {},
			onColumnDelete: () => {},
			onColumnSectionTypeChange: () => {},
			onTaskReminderEdit: () => {},
			onAddFromTemplate: () => {},
			onLibraryConfigChange: () => {},
		};
	}

	/**
	 * Create fully functional callbacks for overlay/note-level dashboard.
	 * All changes are written back directly to the note file using parser.serialize().
	 */
	private createOverlayCallbacks() {
		const self = this;

		function findColumn(name: string) {
			return self.data?.columns.find(c => c.name === name);
		}

		function findCard(cardId: string): { col: import('./types').DashboardColumn; card: DashboardCard } | null {
			if (!self.data) return null;
			for (const col of self.data.columns) {
				const card = col.cards.find(c => c.id === cardId);
				if (card) return { col, card };
			}
			return null;
		}

		async function saveAndRefresh(): Promise<void> {
			if (!self.data || !self.overlayNotePath) return;
			const file = self.app.vault.getAbstractFileByPath(self.overlayNotePath);
			if (!(file instanceof TFile)) return;
			try {
				const newContent = serialize(self.data);
				await self.app.vault.modify(file, newContent);
				self.render();
			} catch (e) {
				console.error('[apex-dashboard] Error saving overlay note:', e);
				new Notice('Error saving changes');
			}
		}

		return {
			onCardEdit: async (card: DashboardCard) => {
				const found = findCard(card.id);
				if (found) {
					Object.assign(found.card, card);
					await saveAndRefresh();
				}
			},
			onCardDelete: async (cardId: string) => {
				if (!self.data) return;
				for (const col of self.data.columns) {
					const idx = col.cards.findIndex(c => c.id === cardId);
					if (idx !== -1) { col.cards.splice(idx, 1); break; }
				}
				await saveAndRefresh();
			},
			onCheckboxToggle: async (cardId: string, taskIndex: number, checked: boolean) => {
				const found = findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].checked = checked;
					await saveAndRefresh();
				}
			},
			onTaskAdd: async (cardId: string, text: string) => {
				const found = findCard(cardId);
				if (found) {
					found.card.tasks.push({ text, checked: false });
					await saveAndRefresh();
				}
			},
			onTaskDelete: async (cardId: string, taskIndex: number) => {
				const found = findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks.splice(taskIndex, 1);
					await saveAndRefresh();
				}
			},
			onTaskReorder: async (cardId: string, fromIndex: number, toIndex: number) => {
				const found = findCard(cardId);
				if (found && fromIndex !== toIndex) {
					const [item] = found.card.tasks.splice(fromIndex, 1);
					found.card.tasks.splice(toIndex, 0, item);
					await saveAndRefresh();
				}
			},
			onTaskMoveToCard: async (srcCardId: string, taskIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = findCard(srcCardId);
				const destFound = findCard(destCardId);
				if (srcFound && destFound) {
					const [task] = srcFound.card.tasks.splice(taskIndex, 1);
					destFound.card.tasks.splice(destIndex, 0, task);
					await saveAndRefresh();
				}
			},
			onTaskEdit: async (cardId: string, taskIndex: number, newText: string) => {
				const found = findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].text = newText;
					await saveAndRefresh();
				}
			},
			onCardAdd: async (columnName: string) => {
				const col = findColumn(columnName);
				if (col && self.data) {
					const newCard: DashboardCard = {
						id: `${Date.now()}-new`,
						title: t('default.todoTitle1') || 'New Task',
						type: 'generic',
						column: columnName,
						body: '',
						tasks: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
						width: 0,
						size: 'M',
						gridCols: 0,
						gridRows: 0,
						gridCol: 0,
						gridRow: 0,
					};
					col.cards.push(newCard);
					await saveAndRefresh();
				}
			},
			onColumnAdd: async (name: string, sectionType?: string) => {
				if (!self.data) return;
				self.data.columns.push({
					name,
					color: '#6366f1',
					sectionType: sectionType || 'project',
					cards: [],
				});
				await saveAndRefresh();
			},
			onBannerEdit: () => {},
			onQuickActionAdd: () => {},
			onQuickActionRemove: () => {},
			onMoveCard: async (cardId: string, targetColumn: string, targetIndex: number) => {
				if (!self.data) return;
				let movedCard: DashboardCard | null = null;
				for (const col of self.data.columns) {
					const idx = col.cards.findIndex(c => c.id === cardId);
					if (idx !== -1) { [movedCard] = col.cards.splice(idx, 1); break; }
				}
				if (!movedCard) return;
				const destCol = findColumn(targetColumn);
				if (destCol) {
					movedCard.column = targetColumn;
					destCol.cards.splice(targetIndex, 0, movedCard);
					await saveAndRefresh();
				}
			},
			onMemoUpdate: async (card: DashboardCard, updates: { body: string; blockquote: string }) => {
				const found = findCard(card.id);
				if (found) {
					found.card.body = updates.body;
					found.card.blockquote = updates.blockquote;
					await saveAndRefresh();
				}
			},
			onProjectDocsUpdate: () => {},
			onProjectDocsReorder: () => {},
			onDocMoveToCard: () => {},
			onProjectDocsAdd: () => {},
			onProjectDocsRemove: () => {},
			onMemoColorChange: async (card: DashboardCard, color: string) => {
				const found = findCard(card.id);
				if (found) { found.card.color = color; await saveAndRefresh(); }
			},
			onProjectCoverChange: async (card: DashboardCard, imagePath: string) => {
				const found = findCard(card.id);
				if (found) { found.card.coverImage = imagePath; await saveAndRefresh(); }
			},
			onCardTitleEdit: async (cardId: string, newTitle: string) => {
				const found = findCard(cardId);
				if (found) { found.card.title = newTitle; await saveAndRefresh(); }
			},
			onCardWidthChange: async (cardId: string, width: number) => {
				const found = findCard(cardId);
				if (found) { found.card.width = width; await saveAndRefresh(); }
			},
			onCardSizeChange: async (cardId: string, size: any) => {
				const found = findCard(cardId);
				if (found) { found.card.size = size; await saveAndRefresh(); }
			},
			onCardGridChange: async (cardId: string, gridCols: number, gridRows: number) => {
				const found = findCard(cardId);
				if (found) { found.card.gridCols = gridCols; found.card.gridRows = gridRows; await saveAndRefresh(); }
			},
			onCardGridMove: async (cardId: string, gridCol: number, gridRow: number) => {
				const found = findCard(cardId);
				if (found) { found.card.gridCol = gridCol; found.card.gridRow = gridRow; await saveAndRefresh(); }
			},
			onFileDrop: () => {},
			onProjectItemReorder: () => {},
			onProjectItemMoveToCard: () => {},
			onColumnRename: async (oldName: string, newName: string) => {
				const col = findColumn(oldName);
				if (col) { col.name = newName; await saveAndRefresh(); }
			},
			onColumnDelete: async (columnName: string) => {
				// Protect first column and columns with tags/links
				if (self.data) {
					const idx = self.data.columns.findIndex(c => c.name === columnName);
					if (idx === 0 || columnName.includes('[[') || columnName.includes('#')) {
						new Notice(t('error.cannotDeleteMainColumn'));
						return;
					}
				}
				if (!self.data) return;
				const idx = self.data.columns.findIndex(c => c.name === columnName);
				if (idx !== -1) { self.data.columns.splice(idx, 1); await saveAndRefresh(); }
			},
			onColumnSectionTypeChange: async (columnName: string, sectionType: string) => {
				const col = findColumn(columnName);
				if (col) { col.sectionType = sectionType; await saveAndRefresh(); }
			},
			onTaskReminderEdit: async (cardId: string, taskIndex: number, reminder: string | undefined) => {
				const found = findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].reminder = reminder;
					await saveAndRefresh();
				}
			},
			onAddFromTemplate: () => {},
			onLibraryConfigChange: () => {},
		};
	}

	/** Exit overlay mode and return to normal sidebar */
	exitOverlayMode(): void {
		this.overlayNotePath = null;
		this.data = null;
		this.render();
	}
}
