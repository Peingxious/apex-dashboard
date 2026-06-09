import { ItemView, Notice, setIcon, WorkspaceLeaf, TFile, Events } from 'obsidian';
import type DashboardPlugin from './main';
import type { DashboardData, DashboardCard, QuickAction, BannerData, WeatherConfig, TrackerConfig, LibraryConfig } from './types';
import { SyncEngine } from './sync';
import { renderDashboard, destroyAllCharts, renderSidebarWidgets, renderSidebarWeekCalendar, renderSidebarPomodoro, renderSidebarReading } from './renderer';
import { renderBanner, BannerEditModal, resolveVaultImage } from './banner';
import { getRecentDocs, renderRecentDocs } from './recent';
import { renderQuickActions, AddActionModal, DocSearchModal } from './quick-actions';
import { setupDragAndDrop } from './dnd';
import { CardEditModal } from './card-edit-modal';
import { showConfirmDialog } from './confirm-dialog';
import { clearWeatherCache } from './weather-service';
import { renderSidebarLunarWidget, loadHolidayData } from './lunar-widget';
import type { HolidayInfo } from './holiday-service';
import { WidgetTypeModal, type WidgetType } from './widget-type-modal';
import { WeatherConfigModal } from './weather-config-modal';
import { LibraryConfigModal } from './library-config-modal';
import { TrackerConfigModal } from './tracker-config-modal';
import { TemplatePickerModal } from './template-modal';
import { PomodoroService } from './pomodoro-service';
import { ReadingService } from './reading-service';
import { ReminderNoticeModal } from './reminder-notice';
import { t } from './i18n';
import { parse } from './parser';

export const DASHBOARD_VIEW_TYPE = 'apex-dashboard-view';

export class DashboardView extends ItemView {
	private plugin: DashboardPlugin;
	private sync: SyncEngine;
	private data: DashboardData | null = null;
	private cleanupFns: Array<() => void> = [];
	private vaultEventRefs: Array<{ evt: Events; ref: unknown }> = [];
	private recentDocsTimer: ReturnType<typeof setTimeout> | null = null;
	private libraryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly RECENT_DOCS_DEBOUNCE = 500;
	private bannerImageIndex = 0;
	private static readonly BANNER_IMAGE_ROTATION_MS = 30 * 60 * 1000; // 30 min (on the half)
	private static readonly REMINDER_CHECK_MS = 60 * 1000; // 1 minute
	private reminderTimer: ReturnType<typeof setInterval> | null = null;
	private firedReminders = new Set<string>();
	private sidebarPinned: boolean;
	private sidebarExpanded = false;
	private bannerCollapsed = localStorage.getItem('apex-dashboard-banner-collapsed') !== 'false';
	private pendingScrollCardId: string | null = null;
	private pendingScrollToLastCardOfColumn: string | null = null;
	private pomodoroService: PomodoroService | null = null;
	private readingService: ReadingService | null = null;
	private holidayData: Record<string, HolidayInfo> = {};
	private mobileWidgetExpanded: 'pomodoro' | 'reading' | 'lunar' | null = null;
	private mobileWidgetTabsOpen: boolean = false;
	private static readonly WEATHER_REFRESH_MS = 30 * 60 * 1000; // 30 minutes
	private weatherRefreshTimer: ReturnType<typeof setInterval> | null = null;

	// Embedded note dashboard mode (tabs persisted in plugin.settings)
	private embeddedData: DashboardData | null = null;
	private embeddedDataCache = new Map<string, DashboardData>();

	/** Get current active tab path from settings */
	get embeddedNotePath(): string | null {
		return this.plugin.settings.activeEmbeddedNoteTab ?? null;
	}

	/** Set active tab path in settings */
	set embeddedNotePath(path: string | null) {
		this.plugin.settings.activeEmbeddedNoteTab = path;
		// Persist to disk so it survives reload
		this.plugin.saveSettings();
	}

	constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.sync = new SyncEngine(this.app, this.plugin.settings);
		// Use saved preference, or fall back to settings default
		const saved = localStorage.getItem('apex-dashboard-sidebar-pinned');
		this.sidebarPinned = saved !== null ? saved === 'true' : plugin.settings.sidebarPinnedDefault;
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
		this.registerVaultListeners();
		this.startReminderChecker();
		this.startWeatherRefresh();
		this.pomodoroService = new PomodoroService(this.plugin);
		await this.pomodoroService.loadSessions();
		this.readingService = new ReadingService(this.plugin);
		await this.readingService.loadSessions();
		loadHolidayData().then(data => {
			this.holidayData = data;
			const currentData = this.sync.getData();
			if (currentData) this.render(currentData);
		});

		// Restore last active embedded note tab if any
		const savedTab = this.plugin.settings.activeEmbeddedNoteTab;
		if (savedTab) {
			this.reenterEmbeddedMode(savedTab);
		}
	}

	async onClose(): Promise<void> {
		this.runCleanup();
		this.unregisterVaultListeners();
		this.stopReminderChecker();
		this.stopWeatherRefresh();
		this.pomodoroService?.destroy();
		this.pomodoroService = null;
		this.readingService?.destroy();
		this.readingService = null;
		this.sync.destroy();
	}

	async refresh(): Promise<void> {
		this.sync.updateSettings(this.plugin.settings);
		const data = this.sync.getData();
		if (data) {
			this.render(data);
		}
	}

	addSection(): void {
		const name = prompt(t('renderer.sectionName'));
		if (name?.trim()) {
			this.sync.addColumn(name.trim());
		}
	}

	private render(data: DashboardData): void {
		this.runCleanup();
		this.data = data;
		this.firedReminders.clear();

		// Use embedded note data if in embedded mode
		const activeData = this.embeddedData ?? data;

		// Save scroll positions before re-render
		const root = this.containerEl.children[1] as HTMLElement;
		const kanbanEl = root?.querySelector('.dashboard-kanban');
		const sidebarScrollEl = root?.querySelector('.dashboard-sidebar-scroll');
		const savedKanbanScroll = kanbanEl ? kanbanEl.scrollTop : 0;
		const savedSidebarScroll = sidebarScrollEl ? sidebarScrollEl.scrollTop : 0;

		const savedCardScrolls = new Map<string, number>();
		root?.querySelectorAll('.dashboard-section-cards').forEach((el) => {
			const section = (el as HTMLElement).closest('.dashboard-section-row');
			const key = section?.getAttribute('data-column') ?? '';
			if (key) savedCardScrolls.set(key, (el as HTMLElement).scrollLeft);
		});

		// Save per-task-list scroll positions so they survive re-render
		const savedTaskListScrolls = new Map<string, number>();
		root?.querySelectorAll('.dashboard-task-list').forEach((el) => {
			const cardId = (el as HTMLElement).dataset.cardId;
			if (cardId) savedTaskListScrolls.set(cardId, (el as HTMLElement).scrollTop);
		});

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('apex-dashboard-root');

		const bannerEl = renderBanner(
			container,
			activeData.banner,
			() => this.openBannerEditModal(activeData),
			this.app,
		);

		this.renderMobileActions(bannerEl);

		if (this.bannerCollapsed && window.innerWidth > 640) {
			bannerEl.addClass('dashboard-banner--collapsed');
		}
		this.setupBannerBehavior(bannerEl);

		// Banner quote rotation
		this.setupBannerRotation(container, activeData.banner);

		this.renderMobileWidgetBar(container);

		// Navigation bar: toggle between main dashboard and note dashboard
		this.renderViewNavBar(container);

		const mainLayout = container.createDiv({ cls: 'dashboard-main' });

		const sidebar = mainLayout.createDiv({ cls: 'dashboard-sidebar' });
		if (this.sidebarPinned) {
			sidebar.addClass('dashboard-sidebar--pinned');
		} else if (this.sidebarExpanded) {
			sidebar.addClass('dashboard-sidebar--expanded');
		} else {
			sidebar.addClass('dashboard-sidebar--collapsed');
		}
		this.renderSidebar(sidebar, container);
		this.setupSidebarBehavior(sidebar, container);

		const kanban = mainLayout.createDiv({ cls: 'dashboard-kanban-wrapper' });
		const renderCallbacks = this.embeddedNotePath ? this.createEmbeddedCallbacks() : this.createCallbacks();
		renderDashboard(kanban, activeData, renderCallbacks, this.app, this.plugin.settings);
		setupDragAndDrop(kanban, renderCallbacks, this.cleanupFns);
		// Library config event delegation
		kanban.addEventListener('dashboard-library-config', ((e: CustomEvent) => {
			const { columnName } = e.detail as { columnName: string };
			this.openLibraryConfigModal(columnName);
		}) as EventListener);


		// Restore scroll positions
		const newKanban = container.querySelector('.dashboard-kanban');
		const newSidebarScroll = container.querySelector('.dashboard-sidebar-scroll');
		if (newKanban) newKanban.scrollTop = savedKanbanScroll;
		if (newSidebarScroll) newSidebarScroll.scrollTop = savedSidebarScroll;

		container.querySelectorAll('.dashboard-section-cards').forEach((el) => {
			const section = (el as HTMLElement).closest('.dashboard-section-row');
			const key = section?.getAttribute('data-column') ?? '';
			const saved = savedCardScrolls.get(key);
			if (saved !== undefined) (el as HTMLElement).scrollLeft = saved;
		});

		// Restore per-task-list scroll positions
		container.querySelectorAll('.dashboard-task-list').forEach((el) => {
			const cardId = (el as HTMLElement).dataset.cardId;
			const saved = cardId ? savedTaskListScrolls.get(cardId) : undefined;
			if (saved !== undefined) (el as HTMLElement).scrollTop = saved;
		});

		// Scroll to newly added card
		if (this.pendingScrollCardId) {
			const cardEl = container.querySelector(`[data-card-id="${this.pendingScrollCardId}"]`);
			if (cardEl) {
				requestAnimationFrame(() => {
					cardEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
				});
			}
			this.pendingScrollCardId = null;
		}
		if (this.pendingScrollToLastCardOfColumn) {
			const colName = this.pendingScrollToLastCardOfColumn;
			const sectionRow = container.querySelector(`[data-column="${colName}"]`);
			if (sectionRow) {
				const cards = sectionRow.querySelectorAll('.dashboard-card');
				const lastCard = cards[cards.length - 1];
				if (lastCard) {
					requestAnimationFrame(() => {
						lastCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
					});
				}
			}
			this.pendingScrollToLastCardOfColumn = null;
		}

	}

	private renderMobileActions(bannerEl: HTMLElement): void {
		const actions = bannerEl.createDiv({ cls: 'dashboard-mobile-actions' });

		const linksBtn = actions.createEl('button', {
			cls: 'dashboard-mobile-action-btn',
			attr: { 'aria-label': t('mobile.quickActions') },
		});
		setIcon(linksBtn, 'zap');
		linksBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openMobileDrawer('quickActions');
		});

		const recentBtn = actions.createEl('button', {
			cls: 'dashboard-mobile-action-btn',
			attr: { 'aria-label': t('mobile.recent') },
		});
		setIcon(recentBtn, 'clock');
		recentBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openMobileDrawer('recent');
		});

		// On mobile, tapping right half of banner reveals the edit button
		const overlay = bannerEl.querySelector('.dashboard-banner-overlay') as HTMLElement;
		if (overlay) {
			overlay.addEventListener('click', (e) => {
				const rect = overlay.getBoundingClientRect();
				const tapX = (e as MouseEvent).clientX - rect.left;
				if (tapX > rect.width * 0.5) {
					const editBtn = overlay.querySelector('.dashboard-banner-edit-btn') as HTMLElement;
					if (editBtn) {
						editBtn.addClass('dashboard-banner-edit-btn--mobile-visible');
					}
				}
			});
		}
	}

	private renderViewNavBar(container: HTMLElement): void {
		const navBar = container.createDiv({ cls: 'dashboard-view-nav-bar' });

		// Left group: tabs
		const leftGroup = navBar.createDiv({ cls: 'dashboard-view-nav-left' });

		// "Main Dashboard" tab (home)
		const mainTab = leftGroup.createEl('button', {
			cls: 'dashboard-view-nav-tab' + (!this.embeddedNotePath ? ' dashboard-view-nav-tab--active' : ''),
			text: t('main.dashboard'),
		});
		setIcon(mainTab, 'home', 'before');
		mainTab.addEventListener('click', () => {
			this.exitEmbeddedMode();
		});

		// Embedded note tabs from settings
		const tabPaths = this.plugin.settings.embeddedNoteTabs ?? [];
		for (const notePath of tabPaths) {
			const noteName = notePath.split('/').pop() ?? notePath;
			const isActive = this.embeddedNotePath === notePath;

			const tabEl = leftGroup.createDiv({
				cls: 'dashboard-view-nav-tab-wrap' + (isActive ? ' dashboard-view-nav-tab--active' : ''),
				attr: { title: notePath },
			});

			const btn = tabEl.createEl('button', { cls: 'dashboard-view-nav-tab', text: noteName });
			setIcon(btn, 'file-code', 'before');
			btn.addEventListener('click', async () => {
				if (!isActive) {
					await this.embedNoteDashboard(notePath);
				}
			});

			// Close button
			const closeBtn = tabEl.createEl('button', { cls: 'dashboard-view-nav-tab-close' });
			setIcon(closeBtn, 'x');
			closeBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.closeNoteTab(notePath);
			});
		}

		// Divider
		navBar.createDiv({ cls: 'dashboard-view-nav-divider' });

		// Right group: action buttons
		const rightGroup = navBar.createDiv({ cls: 'dashboard-view-nav-right' });

		// "+ Open" button: pick a file with columns frontmatter
		const openBtn = rightGroup.createEl('button', {
			cls: 'dashboard-view-nav-btn',
			text: t('noteDash.openDash'),
		});
		setIcon(openBtn, 'plus', 'before');
		openBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.showColumnFilePicker(navBar);
		});
	}

	/** Scan files for columns frontmatter and show picker */
	private async showColumnFilePicker(anchorEl: HTMLElement): Promise<void> {
		const mdFiles = this.app.vault.getMarkdownFiles();
		const columnFiles: TFile[] = [];

		for (const f of mdFiles) {
			try {
				const content = await this.app.vault.read(f);
				if (content.trimStart().startsWith('---')) {
					const endIdx = content.indexOf('---', 3);
					if (endIdx !== -1) {
						const yaml = content.slice(3, endIdx);
						// Look for columns: or column: in YAML (not dashboard:)
						if ((yaml.includes('columns:') || yaml.includes('column:')) && !yaml.includes('apex-dashboard-template')) {
							columnFiles.push(f);
						}
					}
				}
			} catch { /* skip */ }
		}

		if (columnFiles.length === 0) {
			new Notice(t('noteDash.noDashboardFiles'));
			return;
		}

		// Remove existing dropdown
		const root = this.containerEl.children[1] as HTMLElement;
		const existing = root?.querySelector('.dashboard-nav-dropdown');
		if (existing) existing.remove();

		// Append dropdown to root (not navBar) to avoid clipping
		const dropdown = root.createDiv({ cls: 'dashboard-nav-dropdown' });
		dropdown.style.position = 'fixed';
		const btnRect = (anchorEl.querySelector('.dashboard-view-nav-btn') as HTMLElement)?.getBoundingClientRect();
		if (btnRect) {
			dropdown.style.top = `${btnRect.bottom}px`;
			dropdown.style.right = `${window.innerWidth - btnRect.right}px`;
		}
		const list = dropdown.createDiv({ cls: 'dashboard-nav-dropdown-list' });

		// Search input
		const searchRow = list.createDiv({ cls: 'dropdown-search-row' });
		const searchInput = searchRow.createEl('input', {
			cls: 'dropdown-search-input',
			type: 'text',
			placeholder: t('noteDash.searchPlaceholder'),
		});

		const titleEl = list.createEl('div', { cls: 'dropdown-title', text: t('noteDash.selectDash') + ` (${columnFiles.length})` });

		const allItems: { el: HTMLElement; file: TFile }[] = [];

		for (const f of columnFiles) {
			const item = list.createEl('button', {
				cls: 'dashboard-nav-dropdown-item',
				text: f.basename,
				attr: { title: f.path },
			});

			if (f.path === this.embeddedNotePath) {
				item.addClass('dashboard-nav-dropdown-item--open');
			}

			allItems.push({ el: item, file: f });

			item.addEventListener('click', async () => {
				dropdown.remove();
				await this.embedNoteDashboard(f.path);
			});
		}

		// Search filter
		searchInput.addEventListener('input', () => {
			const q = searchInput.value.toLowerCase().trim();
			let visibleCount = 0;
			for (const { el, file } of allItems) {
				const match = !q || file.basename.toLowerCase().includes(q);
				el.style.display = match ? '' : 'none';
				if (match) visibleCount++;
			}
			titleEl.textContent = q
				? t('noteDash.selectDash') + ` (${visibleCount}/${columnFiles.length})`
				: t('noteDash.selectDash') + ` (${columnFiles.length})`;
		});

		// Close on outside click
		const closeOnOutside = (ev: MouseEvent) => {
			if (!dropdown.contains(ev.target as Node)) {
				dropdown.remove();
				document.removeEventListener('mousedown', closeOnOutside);
			}
		};
		setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
	}

	/** Load a note's dashboard data and render it embedded in the main view */
	async embedNoteDashboard(notePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) {
			new Notice(t('noteDash.fileNotFound'));
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			this.embeddedData = parse(content);
			this.embeddedNotePath = notePath;
			// Add to persisted tabs list if not already there
			const tabs = this.plugin.settings.embeddedNoteTabs ?? [];
			if (!tabs.includes(notePath)) {
				tabs.push(notePath);
				this.plugin.settings.embeddedNoteTabs = tabs;
				this.plugin.saveSettings();
			}
			// Update cache
			this.embeddedDataCache.set(notePath, this.embeddedData);

			// Re-render with embedded data
			const currentData = this.sync.getData();
			if (currentData) this.render(currentData);

			// Add apex-note-dashboard-root class for fixed-width card styles
			const root = this.containerEl.children[1] as HTMLElement;
			root?.addClass('apex-note-dashboard-root');
		} catch (err) {
			console.error('[apex-dashboard] Error loading note:', err);
			new Notice(t('noteDash.loadError'));
		}
	}

	/** Close a note tab from the navigation bar */
	async closeNoteTab(notePath: string): Promise<void> {
		const tabs = (this.plugin.settings.embeddedNoteTabs ?? []).filter(p => p !== notePath);
		this.plugin.settings.embeddedNoteTabs = tabs;

		// If closing the active tab, switch to main dashboard
		if (this.plugin.settings.activeEmbeddedNoteTab === notePath) {
			this.plugin.settings.activeEmbeddedNoteTab = null;
			this.embeddedData = null;
			const root = this.containerEl.children[1] as HTMLElement;
			root?.removeClass('apex-note-dashboard-root');
			const currentData = this.sync.getData();
			if (currentData) this.render(currentData);
		}

		await this.plugin.saveSettings();
	}

	/** Re-enter embedded mode from cached data */
	private async reenterEmbeddedMode(notePath: string): Promise<void> {
		let data = this.embeddedDataCache.get(notePath);
		if (!data) {
			// Cache miss — reload from file
			const file = this.app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof TFile)) return;
			try {
				const content = await this.app.vault.read(file);
				data = parse(content);
				this.embeddedDataCache.set(notePath, data);
			} catch (err) {
				console.error('[apex-dashboard] Error reloading note:', err);
				new Notice(t('noteDash.loadError'));
				return;
			}
		}
		this.embeddedNotePath = notePath;
		this.embeddedData = data;

		const currentData = this.sync.getData();
		if (currentData) this.render(currentData);

		const root = this.containerEl.children[1] as HTMLElement;
		root?.addClass('apex-note-dashboard-root');
	}

	/** Exit embedded mode, return to main dashboard (keep tabs intact) */
	private exitEmbeddedMode(): void {
		if (!this.plugin.settings.activeEmbeddedNoteTab) return;
		this.plugin.settings.activeEmbeddedNoteTab = null;
		this.embeddedData = null;
		// Keep cache and tabs intact — do NOT clear them

		const root = this.containerEl.children[1] as HTMLElement;
		root?.removeClass('apex-note-dashboard-root');

		const currentData = this.sync.getData();
		if (currentData) this.render(currentData);

		// Persist the tab state change
		this.plugin.saveSettings();
	}

	/** Create callbacks for embedded note mode (save changes back to note) */
	private createEmbeddedCallbacks() {
		const self = this;
		return {
			onCardEdit: (card: DashboardCard) => {
				const modal = new CardEditModal(this.app, card, (updates) => {
					const c = self.findEmbeddedCard(card.id);
					if (c) Object.assign(c.card, updates);
					self.saveEmbeddedAndRefresh();
				}, this.plugin.settings.stylePreset);
				modal.open();
			},
			onCardDelete: async (cardId: string) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				self.deleteEmbeddedCardById(cardId);
				await self.saveEmbeddedAndRefresh();
			},
			onCheckboxToggle: async (cardId: string, taskIndex: number, checked: boolean) => {
				const found = self.findEmbeddedCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].checked = checked;
					await self.saveEmbeddedAndRefresh();
				}
			},
			onTaskAdd: async (cardId: string, text: string) => {
				const found = self.findEmbeddedCard(cardId);
				if (found) {
					found.card.tasks.push({ text, checked: false });
					await self.saveEmbeddedAndRefresh();
				}
			},
			onTaskDelete: async (cardId: string, taskIndex: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks.splice(taskIndex, 1);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onTaskReorder: async (cardId: string, from: number, to: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found && from !== to) {
					const [item] = found.card.tasks.splice(from, 1);
					found.card.tasks.splice(to, 0, item);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onTaskMoveToCard: async (srcCardId: string, taskIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = self.findEmbeddedCard(srcCardId);
				const destFound = self.findEmbeddedCard(destCardId);
				if (srcFound && destFound) {
					const [task] = srcFound.card.tasks.splice(taskIndex, 1);
					destFound.card.tasks.splice(destIndex, 0, task);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onTaskEdit: async (cardId: string, taskIndex: number, newText: string) => {
				const found = self.findEmbeddedCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].text = newText;
					await self.saveEmbeddedAndRefresh();
				}
			},
			onCardAdd: async (columnName: string) => {
				if (!self.embeddedData) return;
				const col = self.embeddedData.columns.find(c => c.name === columnName);
				if (!col) return;
				const effectiveType = col.sectionType ?? col.name.toLowerCase();

				if (effectiveType === 'memo' || effectiveType === 'todo') {
					col.cards.push({
						id: `${Date.now()}-new`,
						title: effectiveType === 'memo' ? t('default.memoTitle', { date: '' }) : t('default.todoTitle1'),
						type: effectiveType === 'memo' ? 'generic' : 'task',
						column: columnName,
						body: '',
						tasks: effectiveType === 'todo' ? [{ text: '', checked: false }] : [],
						url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
						blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
						gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
					});
					await self.saveEmbeddedAndRefresh();
				} else {
					self.openEmbeddedProjectSearch(columnName);
				}
			},
			onColumnAdd: async (name: string, sectionType?: string) => {
				if (!self.embeddedData) return;
				self.embeddedData.columns.push({
					name,
					color: '#6366f1',
					sectionType: sectionType || 'project',
					cards: [],
				});
				await self.saveEmbeddedAndRefresh();
			},
			onBannerEdit: () => self.openEmbeddedBannerEditModal(),
			onQuickActionAdd: () => self.openEmbeddedAddActionModal(),
			onQuickActionRemove: async (index: number) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (confirmed && self.embeddedData) {
					self.embeddedData.quickActions.splice(index, 1);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onMoveCard: async (cardId: string, targetColumn: string, targetIndex: number) => {
				if (!self.embeddedData) return;
				let movedCard: DashboardCard | null = null;
				for (const col of self.embeddedData.columns) {
					const idx = col.cards.findIndex(c => c.id === cardId);
					if (idx !== -1) { [movedCard] = col.cards.splice(idx, 1); break; }
				}
				if (!movedCard) return;
				const destCol = self.embeddedData.columns.find(c => c.name === targetColumn);
				if (destCol) {
					movedCard.column = targetColumn;
					destCol.cards.splice(targetIndex, 0, movedCard);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onMemoUpdate: async (card: DashboardCard, updates: { body: string; blockquote: string }) => {
				const found = self.findEmbeddedCard(card.id);
				if (found) {
					found.card.body = updates.body;
					found.card.blockquote = updates.blockquote;
					await self.saveEmbeddedAndRefresh();
				}
			},
			onProjectDocsUpdate: async (card: DashboardCard, docPaths: string[]) => {
				const found = self.findEmbeddedCard(card.id);
				if (found) {
					found.card.projectDocs = docPaths.map(p => ({ path: p, children: [] }));
					await self.saveEmbeddedAndRefresh();
				}
			},
			onProjectDocsReorder: async (cardId: string, from: number, to: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found?.card.projectDocs) {
					const [item] = found.card.projectDocs.splice(from, 1);
					found.card.projectDocs.splice(to, 0, item);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onDocMoveToCard: async (srcCardId: string, docIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = self.findEmbeddedCard(srcCardId);
				const destFound = self.findEmbeddedCard(destCardId);
				if (srcFound?.card.projectDocs && destFound) {
					const [doc] = srcFound.card.projectDocs.splice(docIndex, 1);
					if (!destFound.card.projectDocs) destFound.card.projectDocs = [];
					destFound.card.projectDocs.splice(destIndex, 0, doc);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onProjectDocsAdd: async (card: DashboardCard, docPath: string) => {
				const found = self.findEmbeddedCard(card.id);
				if (found) {
					if (!found.card.projectDocs) found.card.projectDocs = [];
					found.card.projectDocs.push({ path: docPath, children: [] });
					await self.saveEmbeddedAndRefresh();
				}
			},
			onProjectDocsRemove: async (card: DashboardCard, topIndex: number) => {
				const found = self.findEmbeddedCard(card.id);
				if (found?.card.projectDocs) {
					found.card.projectDocs.splice(topIndex, 1);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onMemoColorChange: async (card: DashboardCard, color: string) => {
				const found = self.findEmbeddedCard(card.id);
				if (found) { found.card.color = color; await self.saveEmbeddedAndRefresh(); }
			},
			onProjectCoverChange: async (card: DashboardCard, imagePath: string) => {
				const found = self.findEmbeddedCard(card.id);
				if (found) { found.card.coverImage = imagePath; await self.saveEmbeddedAndRefresh(); }
			},
			onCardTitleEdit: async (cardId: string, newTitle: string) => {
				const found = self.findEmbeddedCard(cardId);
				if (found) { found.card.title = newTitle; await self.saveEmbeddedAndRefresh(); }
			},
			onCardWidthChange: async (cardId: string, width: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found) { found.card.width = width; await self.saveEmbeddedAndRefresh(); }
			},
			onCardSizeChange: async (cardId: string, size: string) => {
				const found = self.findEmbeddedCard(cardId);
				if (found) { found.card.size = size as import('./types').CardSize; await self.saveEmbeddedAndRefresh(); }
			},
			onCardGridChange: async (cardId: string, gridCols: number, gridRows: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found) { found.card.gridCols = gridCols; found.card.gridRows = gridRows; await self.saveEmbeddedAndRefresh(); }
			},
			onCardGridMove: async (cardId: string, gridCol: number, gridRow: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found) { found.card.gridCol = gridCol; found.card.gridRow = gridRow; await self.saveEmbeddedAndRefresh(); }
			},
			onFileDrop: async (cardId: string, filePath: string) => {
				if (!self.embeddedData) return;
				const found = self.findEmbeddedCard(cardId);
				if (!found) return;
				const col = self.embeddedData.columns.find(c => c.name === found.card.column);
				const sectionType = col?.sectionType ?? col?.name.toLowerCase() ?? '';
				const cardType = found.card.type;
				if (cardType === 'weather' || cardType === 'tracker') return;
				if (sectionType === 'todo') {
					found.card.tasks.push({ text: `[[${filePath}]]`, checked: false });
				} else if (sectionType === 'memo') {
					found.card.body += (found.card.body ? '\n' : '') + `[[${filePath}]]`;
				} else {
					if (!found.card.projectDocs) found.card.projectDocs = [];
					found.card.projectDocs.push({ path: filePath, children: [] });
				}
				await self.saveEmbeddedAndRefresh();
			},
			onProjectItemReorder: async (cardId: string, fromIndex: number, toIndex: number) => {
				const found = self.findEmbeddedCard(cardId);
				if (found?.card.projectDocs) {
					const [item] = found.card.projectDocs.splice(fromIndex, 1);
					found.card.projectDocs.splice(toIndex, 0, item);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onProjectItemMoveToCard: async (srcCardId: string, itemIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = self.findEmbeddedCard(srcCardId);
				const destFound = self.findEmbeddedCard(destCardId);
				if (srcFound?.card.projectDocs && destFound) {
					const [item] = srcFound.card.projectDocs.splice(itemIndex, 1);
					if (!destFound.card.projectDocs) destFound.card.projectDocs = [];
					destFound.card.projectDocs.splice(destIndex, 0, item);
					await self.saveEmbeddedAndRefresh();
				}
			},
			onColumnRename: async (oldName: string, newName: string) => {
				const col = self.embeddedData?.columns.find(c => c.name === oldName);
				if (col) { col.name = newName; await self.saveEmbeddedAndRefresh(); }
			},
			onColumnDelete: async (columnName: string) => {
				// Protect first column and columns with tags/links
				if (self.embeddedData) {
					const idx = self.embeddedData.columns.findIndex(c => c.name === columnName);
					if (idx === 0 || columnName.includes('[[') || columnName.includes('#')) {
						new Notice(t('error.cannotDeleteMainColumn'));
						return;
					}
				}
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('renderer.deleteSectionConfirm', { column: columnName }),
				});
				if (confirmed && self.embeddedData) {
					const idx = self.embeddedData.columns.findIndex(c => c.name === columnName);
					if (idx !== -1) { self.embeddedData.columns.splice(idx, 1); await self.saveEmbeddedAndRefresh(); }
				}
			},
			onColumnSectionTypeChange: async (columnName: string, sectionType: string) => {
				const col = self.embeddedData?.columns.find(c => c.name === columnName);
				if (col) { col.sectionType = sectionType; await self.saveEmbeddedAndRefresh(); }
			},
			onTaskReminderEdit: async (cardId: string, taskIndex: number, reminder: string | undefined) => {
				const found = self.findEmbeddedCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].reminder = reminder;
					await self.saveEmbeddedAndRefresh();
				}
			},
		onProjectGroupAdd: async (columnName: string, title: string) => {
				const col = self.embeddedData?.columns.find(c => c.name === columnName);
				if (!col) return;
				col.cards.push({
					id: `${Date.now()}-project`,
					title,
					type: 'project',
					column: columnName,
					body: '',
					tasks: [], url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
					blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
					projectDocs: [],
					gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
				});
				await self.saveEmbeddedAndRefresh();
			},
			onAddFromTemplate: (columnName: string) => self.openEmbeddedTemplatePicker(columnName),
			onLibraryConfigChange: (columnName: string) => self.openEmbeddedLibraryConfigModal(columnName),
	};
}

	// --- Embedded mode helpers ---

	private findEmbeddedCard(cardId: string): { col: import('./types').DashboardColumn; card: DashboardCard } | null {
		if (!this.embeddedData) return null;
		for (const col of this.embeddedData.columns) {
			const card = col.cards.find(c => c.id === cardId);
			if (card) return { col, card };
		}
		return null;
	}

	private deleteEmbeddedCardById(cardId: string): void {
		if (!this.embeddedData) return;
		for (const col of this.embeddedData.columns) {
			const idx = col.cards.findIndex(c => c.id === cardId);
			if (idx !== -1) { col.cards.splice(idx, 1); break; }
		}
	}

	private async saveEmbeddedAndRefresh(): Promise<void> {
		if (!this.embeddedData || !this.embeddedNotePath) return;
		const { serialize } = await import('./parser');
		const newContent = serialize(this.embeddedData);
		this.embeddedDataCache.set(this.embeddedNotePath, this.embeddedData);
		const file = this.app.vault.getAbstractFileByPath(this.embeddedNotePath);
		if (file instanceof TFile) {
			try {
				await this.app.vault.modify(file, newContent);
			} catch (e) {
				console.error('[apex-dashboard] Error saving embedded note:', e);
				new Notice(t('noteDash.saveError'));
			}
		}
		// Re-render
		const currentData = this.sync.getData();
		if (currentData) this.render(currentData);
	}

	private openEmbeddedBannerEditModal(): void {
		if (!this.embeddedData) return;
		const modal = new BannerEditModal(this.app, this.embeddedData.banner, async (updates) => {
			Object.assign(this.embeddedData!.banner, updates);
			await this.saveEmbeddedAndRefresh();
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openEmbeddedAddActionModal(): void {
		const modal = new AddActionModal(this.app, async (action) => {
			if (!this.embeddedData) return;
			if (!this.embeddedData.quickActions) this.embeddedData.quickActions = [];
			this.embeddedData.quickActions.push(action);
			await this.saveEmbeddedAndRefresh();
		});
		modal.open();
	}

	private openEmbeddedProjectSearch(colName: string): void {
		const modal = new DocSearchModal(this.app, async (link) => {
			if (!this.embeddedData) return;
			const col = this.embeddedData.columns.find(c => c.name === colName);
			if (!col) return;
			col.cards.push({
				id: `${Date.now()}-project`,
				title: link.name,
				type: 'project',
				column: colName,
				body: `[[${link.path}]]`,
				tasks: [], url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
				blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
				projectDocs: [{ path: link.path, children: [] }],
				gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
			});
			this.saveEmbeddedAndRefresh();
		});
		modal.open();
	}

	private openEmbeddedTemplatePicker(colName: string): void {
		const modal = new TemplatePickerModal(
			this.app,
			this.plugin,
			async (template) => {
				if (!this.embeddedData) return;
				const col = this.embeddedData.columns.find(c => c.name === colName);
				if (!col) return;
				col.cards.push({
					id: `${Date.now()}-template`,
					title: template.name,
					type: 'task',
					column: colName,
					body: '',
					tasks: template.tasks.map(text => ({ text, checked: false })),
					url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
					blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
					gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
				});
				this.saveEmbeddedAndRefresh();
			},
			this.plugin.settings.stylePreset,
		);
		modal.open();
	}

	private openEmbeddedLibraryConfigModal(colName: string): void {
		const column = this.embeddedData?.columns.find(col => col.name === colName);
		const existingConfig = column?.libraryConfig ?? {
			filters: [],
			viewMode: 'grid' as const,
			sortBy: 'modified',
			sortDesc: true,
		};
		const modal = new LibraryConfigModal(
			this.app,
			existingConfig,
			async (config) => {
				const col = this.embeddedData?.columns.find(c => c.name === colName);
				if (col) { col.libraryConfig = config; this.saveEmbeddedAndRefresh(); }
			},
		);
		modal.open();
	}

	private renderMobileWidgetBar(container: HTMLElement): void {
		this.mobileWidgetTabsOpen = false;
		this.mobileWidgetExpanded = null;

		const bar = container.createDiv({ cls: 'dashboard-mobile-widget-bar' });

		// Thin strip: collapsed state, tap to expand tabs
		const strip = bar.createDiv({ cls: 'dashboard-mobile-widget-strip' });
		strip.createDiv({ cls: 'dashboard-mobile-widget-strip-hint' });
		strip.addEventListener('click', (e) => {
			e.stopPropagation();
			this.mobileWidgetTabsOpen = !this.mobileWidgetTabsOpen;
			if (!this.mobileWidgetTabsOpen) {
				this.mobileWidgetExpanded = null;
			}
			this.refreshMobileWidgetPanel(bar);
		});

		// Tab row: hidden by default, revealed by tapping strip
		const tabs = bar.createDiv({ cls: 'dashboard-mobile-widget-tabs' });

		const widgets: Array<{ key: 'pomodoro' | 'reading' | 'lunar'; label: string; icon: string }> = [
			{ key: 'pomodoro', label: t('mobile.pomodoro'), icon: 'hourglass' },
			{ key: 'reading', label: t('mobile.reading'), icon: 'book-open' },
			{ key: 'lunar', label: t('mobile.lunar'), icon: 'moon' },
		];

		const panel = bar.createDiv({ cls: 'dashboard-mobile-widget-panel' });

		for (const w of widgets) {
			const btn = tabs.createEl('button', {
				cls: 'dashboard-mobile-widget-btn',
				attr: { 'aria-label': w.label },
			});
			setIcon(btn, w.icon);

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (this.mobileWidgetExpanded === w.key) {
					this.mobileWidgetExpanded = null;
				} else {
					this.mobileWidgetExpanded = w.key;
				}
				this.refreshMobileWidgetPanel(bar);
			});

			btn.dataset.widgetKey = w.key;
		}

		this.refreshMobileWidgetPanel(bar);
	}

	private refreshMobileWidgetPanel(bar: HTMLElement): void {
		const strip = bar.querySelector('.dashboard-mobile-widget-strip');
		const tabs = bar.querySelector('.dashboard-mobile-widget-tabs');
		const panel = bar.querySelector('.dashboard-mobile-widget-panel') as HTMLElement | null;
		if (!strip || !tabs || !panel) return;

		// Toggle strip active state
		strip.classList.toggle('dashboard-mobile-widget-strip--active', this.mobileWidgetTabsOpen);

		// Toggle tabs visibility
		tabs.classList.toggle('dashboard-mobile-widget-tabs--open', this.mobileWidgetTabsOpen);

		// Update button active states
		tabs.querySelectorAll('.dashboard-mobile-widget-btn').forEach((btn) => {
			const el = btn as HTMLElement;
			el.classList.toggle('active', el.dataset.widgetKey === this.mobileWidgetExpanded);
		});

		// Render panel content
		panel.empty();

		if (!this.mobileWidgetExpanded) {
			panel.removeClass('dashboard-mobile-widget-panel--open');
			return;
		}

		panel.addClass('dashboard-mobile-widget-panel--open');

		if (this.mobileWidgetExpanded === 'pomodoro' && this.pomodoroService) {
			renderSidebarPomodoro(panel, this.pomodoroService, this.plugin.settings);
		} else if (this.mobileWidgetExpanded === 'reading' && this.readingService) {
			renderSidebarReading(panel, this.readingService);
		} else if (this.mobileWidgetExpanded === 'lunar') {
			renderSidebarLunarWidget(panel, this.holidayData, this.app);
		}
	}

	private setupBannerBehavior(bannerEl: HTMLElement): void {
		const pinBtn = bannerEl.createEl('button', {
			cls: 'dashboard-banner-pin-btn',
			attr: { 'aria-label': 'Toggle banner' },
		});
		setIcon(pinBtn, 'bookmark');

		pinBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (window.innerWidth <= 640) return;
			this.bannerCollapsed = !this.bannerCollapsed;
			bannerEl.toggleClass('dashboard-banner--collapsed', this.bannerCollapsed);
			localStorage.setItem('apex-dashboard-banner-collapsed', String(this.bannerCollapsed));
		});

		const onResize = () => {
			if (window.innerWidth <= 640 && this.bannerCollapsed) {
				bannerEl.removeClass('dashboard-banner--collapsed');
			} else if (this.bannerCollapsed) {
				bannerEl.addClass('dashboard-banner--collapsed');
			}
		};
		window.addEventListener('resize', onResize);
		this.cleanupFns.push(() => window.removeEventListener('resize', onResize));
	}

	private setupBannerRotation(container: HTMLElement, banner: BannerData): void {
		// Image rotation only
		const images = banner.images;
		if (images && images.length > 1) {
			const imgIndex = Math.floor(Date.now() / DashboardView.BANNER_IMAGE_ROTATION_MS) % images.length;
			this.bannerImageIndex = imgIndex;

			const bannerEl = container.querySelector('.dashboard-banner') as HTMLElement;
			if (bannerEl) {
				const resolved = resolveVaultImage(this.app, images[imgIndex]!);
				if (resolved) {
					bannerEl.style.backgroundImage = `url("${resolved}")`;
				}

				const rotateImage = () => {
					this.bannerImageIndex = (this.bannerImageIndex + 1) % images.length;
					const nextPath = images[this.bannerImageIndex]!;
					const nextResolved = resolveVaultImage(this.app, nextPath);

					bannerEl.addClass('dashboard-banner--fading');

					setTimeout(() => {
						if (nextResolved) {
							bannerEl.style.backgroundImage = `url("${nextResolved}")`;
						}
						bannerEl.removeClass('dashboard-banner--fading');
					}, 600);
				};

				const imgTimer = setInterval(rotateImage, DashboardView.BANNER_IMAGE_ROTATION_MS);
				this.cleanupFns.push(() => clearInterval(imgTimer));
			}
		}
	}

	private openMobileDrawer(type: 'quickActions' | 'recent'): void {
		this.closeMobileDrawer();

		const root = this.containerEl.children[1] as HTMLElement;
		if (!root) return;

		const firstSection = root.querySelector('.dashboard-section-row') as HTMLElement;
		const drawerTop = firstSection ? firstSection.getBoundingClientRect().top : 0;

		const drawer = root.createDiv({ cls: 'dashboard-mobile-drawer' });
		drawer.style.top = `${drawerTop}px`;

		const content = drawer.createDiv({ cls: 'dashboard-mobile-drawer-content' });

		if (type === 'quickActions') {
			content.createEl('h4', { text: t('mobile.quickActions'), cls: 'dashboard-mobile-drawer-title' });
			if (this.data) {
				renderQuickActions(
					content,
					this.data.quickActions,
					(action) => { this.executeAction(action); this.closeMobileDrawer(); },
					async (index) => {
						const confirmed = await showConfirmDialog(this.app, {
							title: t('common.confirmDelete'),
							message: t('common.confirmDeleteMessage'),
						});
						if (!confirmed) return;
						this.sync.removeQuickAction(index);
					},
					() => this.openAddActionModal(),
					undefined,
					undefined,
					this.data.quickActionOrder,
					(order) => this.sync.reorderQuickActions(order),
					async (key) => {
						const confirmed = await showConfirmDialog(this.app, {
							title: t('common.confirmDelete'),
							message: t('common.confirmDeleteMessage'),
						});
						if (!confirmed) return;
						this.sync.removeQuickActionByKey(key);
					},
					this.data.hiddenPresets,
				);
			}
		} else {
			content.createEl('h4', { text: t('mobile.recent'), cls: 'dashboard-mobile-drawer-title' });
			const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
			renderRecentDocs(content, docs, (path) => this.navigateToPath(path));
		}

		const backdrop = drawer.createDiv({ cls: 'dashboard-mobile-drawer-backdrop' });
		backdrop.addEventListener('click', () => this.closeMobileDrawer());

		requestAnimationFrame(() => {
			content.addClass('dashboard-mobile-drawer-content--open');
		});
	}

	private closeMobileDrawer(): void {
		const root = this.containerEl.children[1] as HTMLElement;
		if (!root) return;
		const existing = root.querySelector('.dashboard-mobile-drawer');
		if (existing) existing.remove();
	}

	private renderSidebar(sidebar: HTMLElement, root: HTMLElement): void {
		if (!this.data) return;

		const scroll = sidebar.createDiv({ cls: 'dashboard-sidebar-scroll' });

		renderSidebarWeekCalendar(scroll);

		renderSidebarWidgets(scroll, this.plugin.settings, this.app, this.pomodoroService ?? undefined, this.readingService ?? undefined, this.holidayData, async (order) => {
			this.plugin.settings = {
				...this.plugin.settings,
				widgetOrder: order,
			};
			await this.plugin.saveSettings();
			this.render(this.data!);
		});

		renderQuickActions(
			scroll,
			this.data.quickActions,
			(action) => this.executeAction(action),
			(index) => {
				showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then(confirmed => {
					if (confirmed) this.sync.removeQuickAction(index);
				});
			},
			() => this.openAddActionModal(),
			this.sidebarPinned,
			() => {
				this.sidebarPinned = !this.sidebarPinned;
				localStorage.setItem('apex-dashboard-sidebar-pinned', String(this.sidebarPinned));
				if (this.sidebarPinned) {
					sidebar.addClass('dashboard-sidebar--pinned');
					sidebar.removeClass('dashboard-sidebar--expanded');
					sidebar.removeClass('dashboard-sidebar--collapsed');
					this.sidebarExpanded = false;
				} else {
					sidebar.removeClass('dashboard-sidebar--pinned');
					sidebar.addClass('dashboard-sidebar--collapsed');
					this.sidebarExpanded = false;
				}
			},
			this.data.quickActionOrder,
			(order) => this.sync.reorderQuickActions(order),
			(key) => {
				showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then(confirmed => {
					if (confirmed) this.sync.removeQuickActionByKey(key);
				});
			},
			this.data.hiddenPresets,
		);

		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(
			scroll,
			docs,
			(path) => this.navigateToPath(path),
		);
	}

	private setupSidebarBehavior(sidebar: HTMLElement, root: HTMLElement): void {
		// Create slim indicator (visible only when collapsed)
		sidebar.createDiv({ cls: 'dashboard-sidebar-slim-indicator' });

		// Use capture phase so child handlers can't stopPropagation before we see it
		sidebar.addEventListener('mousedown', (e: MouseEvent) => {
			if (this.sidebarPinned) return;
			if (sidebar.hasClass('dashboard-sidebar--collapsed')) {
				e.preventDefault();
				e.stopPropagation();
				sidebar.removeClass('dashboard-sidebar--collapsed');
				sidebar.addClass('dashboard-sidebar--expanded');
				this.sidebarExpanded = true;
			}
		}, true);

		// Click outside to collapse
		const outsideHandler = (e: MouseEvent) => {
			if (this.sidebarPinned) return;
			if (!this.sidebarExpanded) return;
			if (sidebar.contains(e.target as Node)) return;
			sidebar.removeClass('dashboard-sidebar--expanded');
			sidebar.addClass('dashboard-sidebar--collapsed');
			this.sidebarExpanded = false;
		};
		root.addEventListener('click', outsideHandler);
		this.cleanupFns.push(() => root.removeEventListener('click', outsideHandler));
	}

	private createCallbacks() {
		return {
			onCardEdit: (card: DashboardCard) => this.openCardEditModal(card),
			onCardDelete: async (cardId: string) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				this.sync.deleteCard(cardId);
				new Notice(t('card.deleted'));
			},
			onCheckboxToggle: (cardId: string, idx: number, checked: boolean) => this.sync.toggleTask(cardId, idx, checked),
			onTaskAdd: (cardId: string, text: string) => this.sync.addTask(cardId, text),
			onTaskDelete: async (cardId: string, idx: number) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				this.sync.deleteTask(cardId, idx);
			},
			onTaskReorder: (cardId: string, from: number, to: number) => this.sync.reorderTask(cardId, from, to),
			onTaskMoveToCard: (srcCardId: string, taskIndex: number, destCardId: string, destIndex: number) => this.sync.moveTaskToCard(srcCardId, taskIndex, destCardId, destIndex),
			onTaskEdit: (cardId: string, idx: number, text: string) => this.sync.editTask(cardId, idx, text),
			onMemoUpdate: (card: DashboardCard, updates: { body: string; blockquote: string }) => this.sync.updateMemoCard(card.id, updates),
			onProjectDocsUpdate: (card: DashboardCard, docPaths: string[]) => this.sync.updateProjectDocs(card.id, docPaths),
			onProjectDocsReorder: (cardId: string, from: number, to: number) => this.sync.reorderDocPaths(cardId, from, to),
			onDocMoveToCard: (srcCardId: string, docIndex: number, destCardId: string, destIndex: number) => this.sync.moveDocToCard(srcCardId, docIndex, destCardId, destIndex),
			onProjectDocsAdd: (card: DashboardCard, docPath: string) => this.sync.addDocToCard(card.id, docPath),
			onProjectDocsRemove: (card: DashboardCard, topIndex: number) => this.sync.removeProjectDoc(card.id, topIndex),
			onCardAdd: (colName: string) => {
				const column = this.data?.columns.find(col => col.name === colName);
				const effectiveType = column?.sectionType ?? colName.toLowerCase();
				if (effectiveType === 'dashboard') {
					this.openWidgetTypeModal(colName);
				} else if (effectiveType === 'memo' || effectiveType === 'todo') {
					this.pendingScrollToLastCardOfColumn = colName;
					this.sync.addCard(colName);
				} else {
					this.openProjectSearchModal(colName);
				}
			},
				onColumnAdd: (name: string, sectionType?: string) => {
					this.sync.addColumn(name, sectionType).then(() => {
						if (sectionType === 'library') {
							this.openLibraryConfigModal(name);
						}
					});
				},
			onBannerEdit: () => {
				if (this.data) this.openBannerEditModal(this.data);
			},
			onQuickActionAdd: () => this.openAddActionModal(),
			onQuickActionRemove: (index: number) => {
				showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				}).then(confirmed => {
					if (confirmed) this.sync.removeQuickAction(index);
				});
			},
			onMoveCard: (cardId: string, targetCol: string, targetIdx: number) => this.sync.moveCard(cardId, targetCol, targetIdx),
			onMemoColorChange: (card: DashboardCard, color: string) => this.sync.updateMemoColor(card.id, color),
			onProjectCoverChange: (card: DashboardCard, imagePath: string) => this.sync.updateProjectCover(card.id, imagePath),
				onCardTitleEdit: (cardId: string, newTitle: string) => this.sync.updateCard(cardId, { title: newTitle }),
				onCardWidthChange: (cardId: string, width: number) => this.sync.updateCardWidth(cardId, width),
					onCardSizeChange: (cardId: string, size: string) => this.sync.updateCardSize(cardId, size as import('./types').CardSize),
				onCardGridChange: (cardId: string, gridCols: number, gridRows: number) => this.sync.updateCardGrid(cardId, gridCols, gridRows),
				onCardGridMove: (cardId: string, gridCol: number, gridRow: number) => this.sync.updateCardGridMove(cardId, gridCol, gridRow),
				onFileDrop: (cardId: string, filePath: string) => this.handleFileDrop(cardId, filePath),
				onProjectItemReorder: (cardId: string, fromIndex: number, toIndex: number) => this.sync.reorderProjectItem(cardId, fromIndex, toIndex),
				onProjectItemMoveToCard: (srcCardId: string, itemIndex: number, destCardId: string, destIndex: number) => this.sync.moveProjectItemToCard(srcCardId, itemIndex, destCardId, destIndex),
				onColumnRename: (oldName: string, newName: string) => this.sync.renameColumn(oldName, newName),
			onColumnDelete: async (columnName: string) => {
				// Protect first column and columns with tags/links
				if (this.data) {
					const idx = this.data.columns.findIndex(c => c.name === columnName);
					if (idx === 0 || columnName.includes('[[') || columnName.includes('#')) {
						new Notice(t('error.cannotDeleteMainColumn'));
						return;
					}
				}
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('renderer.deleteSectionConfirm', { column: columnName }),
				});
				if (confirmed) {
					this.sync.deleteColumn(columnName);
				}
			},
			onColumnSectionTypeChange: (columnName: string, sectionType: string) => this.sync.setColumnSectionType(columnName, sectionType),
			onTaskReminderEdit: (cardId: string, taskIndex: number, reminder: string | undefined) => this.sync.editTaskReminder(cardId, taskIndex, reminder),
		onProjectGroupAdd: async (columnName: string, title: string) => {
				const column = this.data?.columns.find(c => c.name === columnName);
				if (!column) return;
				this.sync.addCard(columnName, {
					id: `${Date.now()}-project`,
					title,
					type: 'project',
					column: columnName,
					body: '',
					tasks: [], url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
					blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
					projectDocs: [],
					gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
				});
			},
			onAddFromTemplate: (columnName: string) => this.openTemplatePicker(columnName),
			onLibraryConfigChange: (columnName: string, config: LibraryConfig) => this.sync.updateLibraryConfig(columnName, config),
	};
}

	private handleFileDrop(cardId: string, filePath: string): void {
		if (!this.data) return;
		let sectionType = 'projects';
		let cardType = 'generic';
		for (const col of this.data.columns) {
			const card = col.cards.find(c => c.id === cardId);
			if (card) {
				sectionType = col.sectionType ?? col.name.toLowerCase();
				cardType = card.type;
				break;
			}
		}
		if (cardType === 'weather' || cardType === 'tracker') return;
			if (cardType === 'task' || sectionType === 'todo') {
			this.sync.addTask(cardId, `[[${filePath}]]`);
		} else if (sectionType === 'memo') {
			this.sync.addFileLinkToMemo(cardId, filePath);
		} else {
			this.sync.addDocToCard(cardId, filePath);
		}
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

	private openWidgetTypeModal(colName: string): void {
		const modal = new WidgetTypeModal(this.app, (type: WidgetType) => {
			if (type === 'weather') {
				this.openWeatherConfigModal(colName);
			} else if (type === 'tracker') {
				this.openTrackerConfigModal(colName);
			}
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openWeatherConfigModal(colName: string): void {
		const modal = new WeatherConfigModal(this.app, (title, config) => {
			this.sync.addCard(colName, {
				title,
				type: 'weather',
				weatherConfig: config,
			});
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openTrackerConfigModal(colName: string): void {
		const modal = new TrackerConfigModal(this.app, (title, config) => {
			this.sync.addCard(colName, {
				title,
				type: 'tracker',
				trackerConfig: config,
			});
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openTemplatePicker(colName: string): void {
		const modal = new TemplatePickerModal(
			this.app,
			this.plugin,
			(template) => {
				this.pendingScrollToLastCardOfColumn = colName;
				this.sync.addCard(colName, {
					title: template.name,
					type: 'task',
					tasks: template.tasks.map(text => ({ text, checked: false })),
				});
			},
			this.plugin.settings.stylePreset,
		);
		modal.open();
	}

	private openLibraryConfigModal(colName: string): void {
		const column = this.data?.columns.find(col => col.name === colName);
		const existingConfig = column?.libraryConfig ?? {
			filters: [],
			viewMode: 'grid' as const,
			sortBy: 'modified',
			sortDesc: true,
		};
		const modal = new LibraryConfigModal(
			this.app,
			existingConfig,
			(config) => {
				this.sync.updateLibraryConfig(colName, config);
			},
		);
		modal.open();
	}

	private openAddActionModal(): void {
		const modal = new AddActionModal(this.app, (action) => {
			this.sync.addQuickAction(action);
		});
		modal.open();
	}

	private async executeAction(action: QuickAction): Promise<void> {
		if (action.type === 'file') {
			await this.navigateToPath(action.target);
		} else if (action.type === 'command') {
			if (action.target === 'daily-notes') {
				await this.createNewJournal();
			} else {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(this.app as any).commands.executeCommandById(action.target);
			}
		}
	}

	private async createNewJournal(): Promise<void> {
		const now = new Date();
		const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		const filePath = `${dateStr}.md`;

		let file = this.app.vault.getFileByPath(filePath);
		if (!file) {
			file = await this.app.vault.create(filePath, `# ${dateStr}\n\n`);
		}

		await this.app.workspace.getLeaf(false).openFile(file);
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

		if (!file) {
			const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			if (basename) {
				const found = this.app.vault.getMarkdownFiles().find(mf => mf.basename === basename);
				if (found) file = found;
			}
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

	private registerVaultListeners(): void {
		const events = this.app.vault;
		const handler = () => {
			this.debouncedRefreshRecentDocs();
			this.debouncedRefreshLibrarySections();
		};

		const createRef = events.on('create', handler);
		const modifyRef = events.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				handler();
			}
		});
		const deleteRef = events.on('delete', handler);
		const renameRef = events.on('rename', handler);

		this.vaultEventRefs = [
			{ evt: events, ref: createRef },
			{ evt: events, ref: modifyRef },
			{ evt: events, ref: deleteRef },
			{ evt: events, ref: renameRef },
		];
	}

	private unregisterVaultListeners(): void {
		for (const { evt, ref } of this.vaultEventRefs) {
			evt.offref(ref as Parameters<typeof evt.offref>[0]);
		}
		this.vaultEventRefs = [];
		if (this.recentDocsTimer) {
			clearTimeout(this.recentDocsTimer);
			this.recentDocsTimer = null;
		}
	}

	private debouncedRefreshRecentDocs(): void {
		if (this.recentDocsTimer) clearTimeout(this.recentDocsTimer);
		this.recentDocsTimer = setTimeout(() => {
			this.refreshRecentDocs();
		}, this.RECENT_DOCS_DEBOUNCE);
	}

	private debouncedRefreshLibrarySections(): void {
		if (!this.data) return;
		const hasLibrary = this.data.columns.some(col => col.sectionType === 'library');
		if (!hasLibrary) return;
		if (this.libraryRefreshTimer) clearTimeout(this.libraryRefreshTimer);
		this.libraryRefreshTimer = setTimeout(() => {
			const data = this.sync.getData();
			if (data) this.render(data);
		}, 500);
	}


	private refreshRecentDocs(): void {
		const root = this.containerEl.children[1] as HTMLElement;
		if (!root) return;

		const recentSection = root.querySelector('.dashboard-recent');
		if (!recentSection) return;

		const parent = recentSection.parentElement;
		if (!parent) return;

		recentSection.remove();
		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(parent, docs, (path) => this.navigateToPath(path));
	}

	private runCleanup(): void {
		destroyAllCharts();
		if (this.pomodoroService) {
			this.pomodoroService.setOnTick(null);
			this.pomodoroService.setOnComplete(null);
		}
		if (this.readingService) {
			this.readingService.setOnTick(null);
		}
		for (const fn of this.cleanupFns) fn();
		this.cleanupFns = [];
	}

	private startReminderChecker(): void {
		this.checkReminders();
		this.reminderTimer = setInterval(() => this.checkReminders(), DashboardView.REMINDER_CHECK_MS);
	}

	private stopReminderChecker(): void {
		if (this.reminderTimer) {
			clearInterval(this.reminderTimer);
			this.reminderTimer = null;
		}
	}

	private startWeatherRefresh(): void {
		this.weatherRefreshTimer = setInterval(() => {
			if (!this.data) return;
			const hasWeather = this.data.columns.some(col =>
				col.cards.some(c => c.type === 'weather')
			);
			if (hasWeather) {
				this.render(this.data);
			}
		}, DashboardView.WEATHER_REFRESH_MS);
	}

	private stopWeatherRefresh(): void {
		if (this.weatherRefreshTimer) {
			clearInterval(this.weatherRefreshTimer);
			this.weatherRefreshTimer = null;
		}
		clearWeatherCache();
	}

	private checkReminders(): void {
		if (!this.data) return;
		const now = new Date();

		for (const col of this.data.columns) {
			for (const card of col.cards) {
				for (let i = 0; i < card.tasks.length; i++) {
					const task = card.tasks[i]!;
					if (!task.reminder || task.checked) continue;

					const key = `${card.id}-${i}`;
					if (this.firedReminders.has(key)) continue;

					const parts = task.reminder.trim().split(/\s+/);
					if (parts.length < 2) continue;
					const [dateStr, timeStr] = parts;
					const [year, month, day] = dateStr!.split('-').map(Number);
					const [hour, min] = timeStr!.split(':').map(Number);
					if (!year || !month || !day) continue;
					const due = new Date(year, month - 1, day, hour ?? 0, min ?? 0);

					if (now >= due) {
						this.firedReminders.add(key);
						const cleanText = task.text.replace(/\[\[[^\]]+\]\]/g, (match) => {
							const inner = match.slice(2, -2);
							return inner.split('|').pop()?.split('/').pop()?.replace(/\.md$/, '') ?? inner;
						});
						this.showReminderModal(cleanText, card.id, i);
					}
				}
			}

			// Countdown reminder
			if (this.plugin.settings.countdownEnabled && this.plugin.settings.countdownTargetDate && this.plugin.settings.countdownReminderDays > 0) {
				const ckKey = 'countdown-remind';
				if (!this.firedReminders.has(ckKey)) {
					const raw = this.plugin.settings.countdownTargetDate;
				const target = raw.includes('T') ? new Date(raw) : new Date(raw + 'T00:00:00');
					const diffMs = target.getTime() - now.getTime();
					const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
					if (daysLeft >= 0 && daysLeft <= this.plugin.settings.countdownReminderDays) {
						this.firedReminders.add(ckKey);
						const label = this.plugin.settings.countdownLabel || this.plugin.settings.countdownTargetDate;
						new Notice(t('countdown.reminderNotice', { label, days: String(daysLeft) }));
					}
				}
			}
		}
	}

	private showReminderModal(taskText: string, cardId: string, taskIndex: number): void {
		const modal = new ReminderNoticeModal(
			this.app,
			taskText,
			() => {
				this.sync.editTaskReminder(cardId, taskIndex, undefined);
			},
			() => {
				const snoozed = new Date(Date.now() + 60 * 60 * 1000);
				const pad = (n: number) => String(n).padStart(2, '0');
				const newReminder = `${snoozed.getFullYear()}-${pad(snoozed.getMonth() + 1)}-${pad(snoozed.getDate())} ${pad(snoozed.getHours())}:${pad(snoozed.getMinutes())}`;
				this.firedReminders.delete(`${cardId}-${taskIndex}`);
				this.sync.editTaskReminder(cardId, taskIndex, newReminder);
			},
		);
		modal.open();
	}
}
