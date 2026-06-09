import { ItemView, WorkspaceLeaf, setIcon, Notice, TFile, Events } from 'obsidian';
import type DashboardPlugin from './main';
import type { DashboardCard, DashboardData } from './types';
import { parse, serialize } from './parser';
import { renderDashboard, renderSidebarWeekCalendar, renderSidebarWidgets, destroyAllCharts } from './renderer';
import { renderBanner, BannerEditModal, resolveVaultImage } from './banner';
import { getRecentDocs, renderRecentDocs } from './recent';
import { renderQuickActions, AddActionModal, DocSearchModal } from './quick-actions';
import { setupDragAndDrop } from './dnd';
import { CardEditModal } from './card-edit-modal';
import { showConfirmDialog } from './confirm-dialog';
import { WidgetTypeModal, type WidgetType } from './widget-type-modal';
import { WeatherConfigModal } from './weather-config-modal';
import { LibraryConfigModal } from './library-config-modal';
import { TrackerConfigModal } from './tracker-config-modal';
import { TemplatePickerModal } from './template-modal';
import { PomodoroService } from './pomodoro-service';
import { ReadingService } from './reading-service';
import { ReminderNoticeModal } from './reminder-notice';
import { t } from './i18n';
import type { HolidayInfo } from './holiday-service';
import { DASHBOARD_VIEW_TYPE } from './view';

export const NOTE_DASHBOARD_VIEW_TYPE = 'apex-note-dashboard-view';

export class NoteDashboardView extends ItemView {
	private plugin: DashboardPlugin;
	private data: DashboardData | null = null;
	private notePath: string | null = null;
	private cleanupFns: Array<() => void> = [];
	private vaultEventRefs: Array<{ evt: Events; ref: unknown }> = [];
	private bannerImageIndex = 0;
	private static readonly BANNER_IMAGE_ROTATION_MS = 30 * 60 * 1000;
	private pomodoroService: PomodoroService | null = null;
	private readingService: ReadingService | null = null;
	private holidayData: Record<string, HolidayInfo> = {};
	private sidebarPinned = true;
	private bannerCollapsed = false;

	constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return NOTE_DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.notePath ? t('noteDash.viewTitle', { note: this.notePath.split('/').pop() ?? '' }) : t('noteDash.viewName');
	}

	getIcon(): string {
		return 'layoutDashboard';
	}

	/** Set the target note path and load its data */
	async setNotePath(path: string): Promise<void> {
		this.notePath = path;
		await this.loadNoteData();
	}

	async onOpen(): Promise<void> {
		this.pomodoroService = new PomodoroService(this.plugin);
		this.readingService = new ReadingService(this.plugin);
		await this.pomodoroService.loadSessions();
		await this.readingService.loadSessions();
		this.holidayData = await loadHolidayData();

		// If we have state (notePath), load it
		const state = this.getState() as { notePath?: string } | undefined;
		if (state?.notePath) {
			this.notePath = state.notePath;
			await this.loadNoteData();
		}
	}

	async onClose(): Promise<void> {
		this.runCleanup();
		this.unregisterVaultListeners();
		this.pomodoroService?.destroy();
		this.pomodoroService = null;
		this.readingService?.destroy();
		this.readingService = null;
	}

	/** Parse and load dashboard data from the note file */
	private async loadNoteData(): Promise<void> {
		if (!this.notePath) return;

		const file = this.app.vault.getAbstractFileByPath(this.notePath);
		if (!(file instanceof TFile)) {
			new Notice(t('noteDash.fileNotFound'));
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			this.data = parse(content);
			this.render();
			this.registerVaultListeners();
		} catch (err) {
			console.error('[apex-dashboard] Error loading note:', err);
			new Notice(t('noteDash.loadError'));
		}
	}

	/** Save current data back to the note file */
	private async saveToNote(): Promise<void> {
		if (!this.data || !this.notePath) return;

		const file = this.app.vault.getAbstractFileByPath(this.notePath);
		if (!(file instanceof TFile)) return;

		try {
			const newContent = serialize(this.data);
			await this.app.vault.modify(file, newContent);
		} catch (e) {
			console.error('[apex-dashboard] Error saving note:', e);
			new Notice(t('noteDash.saveError'));
		}
	}

	render(): void {
		this.runCleanup();
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass('apex-dashboard-root');
		container.addClass('apex-note-dashboard-root');

		if (!this.data) {
			container.createEl('p', { text: t('noteDash.noData') });
			return;
		}

		// Banner
		const bannerEl = renderBanner(
			container,
			this.data.banner,
			() => this.openBannerEditModal(),
			this.app,
		);

		if (this.bannerCollapsed) {
			bannerEl.addClass('dashboard-banner--collapsed');
		}
		this.setupBannerBehavior(bannerEl);

		// Navigation bar: multi-dashboard file switcher
		this.renderViewNavBar(container);

		// Main layout
		const mainLayout = container.createDiv({ cls: 'dashboard-main' });

		// Sidebar
		const sidebar = mainLayout.createDiv({ cls: 'dashboard-sidebar dashboard-sidebar--pinned' });
		this.renderSidebar(sidebar);

		// Kanban
		const kanban = mainLayout.createDiv({ cls: 'dashboard-kanban-wrapper' });
		renderDashboard(kanban, this.data, this.createCallbacks(), this.app, this.plugin.settings);
		setupDragAndDrop(kanban, this.createCallbacks(), this.cleanupFns);
		// Library config event delegation
		kanban.addEventListener('dashboard-library-config', ((e: CustomEvent) => {
			const { columnName } = e.detail as { columnName: string };
			this.openLibraryConfigModal(columnName);
		}) as EventListener);

		// Banner rotation
		this.setupBannerRotation(container, this.data.banner);
	}

	private renderSidebar(sidebar: HTMLElement): void {
		const scroll = sidebar.createDiv({ cls: 'dashboard-sidebar-scroll' });

		renderSidebarWeekCalendar(scroll);

		renderSidebarWidgets(scroll, this.plugin.settings, this.app, this.pomodoroService ?? undefined, this.readingService ?? undefined, this.holidayData);

		if (this.data?.quickActions && this.data.quickActions.length > 0) {
			renderQuickActions(
				scroll,
				this.data.quickActions,
				(action) => this.executeAction(action),
				(index) => this.removeQuickAction(index),
				() => this.openAddActionModal(),
				true,
				undefined,
				this.data.quickActionOrder,
				(order) => this.reorderQuickActions(order),
				(key) => this.removeQuickActionByKey(key),
				this.data.hiddenPresets,
			);
		}

		const docs = getRecentDocs(this.app, this.plugin.settings.recentDocCount);
		renderRecentDocs(
			scroll,
			docs,
			(path) => this.navigateToPath(path),
		);
	}

	private renderViewNavBar(container: HTMLElement): void {
		const navBar = container.createDiv({ cls: 'dashboard-view-nav-bar' });

		// Left side: recent dashboard files + current file tabs
		const leftGroup = navBar.createDiv({ cls: 'dashboard-view-nav-left' });

		// Home icon / dashboard indicator
		const homeBtn = leftGroup.createEl('button', {
			cls: 'dashboard-view-nav-home',
			attr: { title: t('main.dashboard') },
		});
		setIcon(homeBtn, 'home');
		homeBtn.addEventListener('click', () => {
			this.plugin.activateView();
		});

		// Recent dashboard files from persisted settings
		const recentFiles = this.plugin.settings.recentDashboardFiles || [];
		for (const path of recentFiles) {
			if (!path) continue;
			const name = path.split('/').pop() ?? path;
			const isActive = path === this.notePath;
			const tab = leftGroup.createEl('button', {
				cls: 'dashboard-view-nav-tab' + (isActive ? ' dashboard-view-nav-tab--active' : ''),
				text: name,
				attr: { title: path },
			});
			tab.addEventListener('click', async () => {
				if (isActive) return;
				await this.plugin.openNoteAsDashboard(path);
			});
		}

		// Divider
		navBar.createDiv({ cls: 'dashboard-view-nav-divider' });

		// Right side: action buttons
		const rightGroup = navBar.createDiv({ cls: 'dashboard-view-nav-right' });

		// "+ Open" button: show a dropdown of all dashboard files
		const openBtn = rightGroup.createEl('button', {
			cls: 'dashboard-view-nav-btn',
			text: t('noteDash.openDash'),
		});
		setIcon(openBtn, 'plus', 'before');

		openBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.showDashboardFilePicker(navBar);
		});

		// "Main Dashboard" button to switch back
		const mainBtn = rightGroup.createEl('button', {
			cls: 'dashboard-view-nav-btn',
			text: t('main.dashboard'),
		});
		setIcon(mainBtn, 'home', 'before');
		mainBtn.addEventListener('click', () => {
			this.plugin.activateView();
		});


		// List other open note-dashboard leaves as quick-switch tabs (replaced by persisted recentFiles)
	}

	private async showDashboardFilePicker(anchorEl: HTMLElement): Promise<void> {
		// Find all markdown files with columns frontmatter
		const mdFiles = this.app.vault.getMarkdownFiles();
		const dashFiles: TFile[] = [];

		for (const f of mdFiles) {
			try {
				const content = await this.app.vault.read(f);
				if (content.trimStart().startsWith('---')) {
					const endIdx = content.indexOf('---', 3);
					if (endIdx !== -1) {
						const yaml = content.slice(3, endIdx);
						if (yaml.includes('columns:')) {
							dashFiles.push(f);
						}
					}
				}
			} catch { /* skip */ }
		}

		if (dashFiles.length === 0) {
			new Notice(t('noteDash.noDashboardFiles'));
			return;
		}

		// Remove existing dropdown if any
		const existing = anchorEl.closest('.apex-note-dashboard-root')?.querySelector('.dashboard-nav-dropdown');
		if (existing) existing.remove();

		const dropdown = anchorEl.parentElement!.createDiv({ cls: 'dashboard-nav-dropdown' });

		const list = dropdown.createDiv({ cls: 'dashboard-nav-dropdown-list' });
		list.createEl('div', { cls: 'dropdown-title', text: t('noteDash.selectDash') + ` (${dashFiles.length})` });

		for (const f of dashFiles) {
			const item = list.createEl('button', {
				cls: 'dashboard-nav-dropdown-item',
				text: f.basename,
				attr: { title: f.path },
			});

			// Highlight if already open
			const isOpening = f.path === this.notePath ||
				this.app.workspace.getLeavesOfType(NOTE_DASHBOARD_VIEW_TYPE).some(l => {
					const s = l.getViewState() as { state?: { notePath?: string } };
					return s?.state?.notePath === f.path;
				});
			if (isOpening) item.addClass('dashboard-nav-dropdown-item--open');

			item.addEventListener('click', async () => {
				dropdown.remove();
				await this.plugin.openNoteAsDashboard(f.path);
			});
		}

		// Close on outside click
		const closeOnOutside = (ev: MouseEvent) => {
			if (!dropdown.contains(ev.target as Node)) {
				dropdown.remove();
				document.removeEventListener('mousedown', closeOnOutside);
			}
		};
		setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
	}

	private setupBannerBehavior(bannerEl: HTMLElement): void {
		const pinBtn = bannerEl.createEl('button', {
			cls: 'dashboard-banner-pin-btn',
			attr: { 'aria-label': 'Toggle banner' },
		});
		setIcon(pinBtn, 'bookmark');

		pinBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.bannerCollapsed = !this.bannerCollapsed;
			bannerEl.toggleClass('dashboard-banner--collapsed', this.bannerCollapsed);
		});
	}

	private setupBannerRotation(container: HTMLElement, banner: import('./types').BannerData): void {
		const images = banner.images;
		if (!images || images.length <= 1) return;

		const imgIndex = Math.floor(Date.now() / NoteDashboardView.BANNER_IMAGE_ROTATION_MS) % images.length;
		this.bannerImageIndex = imgIndex;

		const bannerEl = container.querySelector('.dashboard-banner') as HTMLElement;
		if (!bannerEl) return;

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

		const imgTimer = setInterval(rotateImage, NoteDashboardView.BANNER_IMAGE_ROTATION_MS);
		this.cleanupFns.push(() => clearInterval(imgTimer));
	}

	private createCallbacks() {
		return {
			onCardEdit: async (card: DashboardCard) => {
				const modal = new CardEditModal(this.app, card, (updates) => {
					const c = this.findCard(card.id);
					if (c) Object.assign(c.card, updates);
					this.saveAndRefresh();
				}, this.plugin.settings.stylePreset);
				modal.open();
			},
			onCardDelete: async (cardId: string) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (!confirmed) return;
				this.deleteCardById(cardId);
				await this.saveAndRefresh();
			},
			onCheckboxToggle: async (cardId: string, taskIndex: number, checked: boolean) => {
				const found = this.findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].checked = checked;
					await this.saveAndRefresh();
				}
			},
			onTaskAdd: async (cardId: string, text: string) => {
				const found = this.findCard(cardId);
				if (found) {
					found.card.tasks.push({ text, checked: false });
					await this.saveAndRefresh();
				}
			},
			onTaskDelete: async (cardId: string, taskIndex: number) => {
				const found = this.findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks.splice(taskIndex, 1);
					await this.saveAndRefresh();
				}
			},
			onTaskReorder: async (cardId: string, fromIndex: number, toIndex: number) => {
				const found = this.findCard(cardId);
				if (found && fromIndex !== toIndex) {
					const [item] = found.card.tasks.splice(fromIndex, 1);
					found.card.tasks.splice(toIndex, 0, item);
					await this.saveAndRefresh();
				}
			},
			onTaskMoveToCard: async (srcCardId: string, taskIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = this.findCard(srcCardId);
				const destFound = this.findCard(destCardId);
				if (srcFound && destFound) {
					const [task] = srcFound.card.tasks.splice(taskIndex, 1);
					destFound.card.tasks.splice(destIndex, 0, task);
					await this.saveAndRefresh();
				}
			},
			onTaskEdit: async (cardId: string, taskIndex: number, newText: string) => {
				const found = this.findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].text = newText;
					await this.saveAndRefresh();
				}
			},
			onProjectGroupAdd: async (columnName: string, title: string) => {
				if (!this.data) return;
				const col = this.data.columns.find(c => c.name === columnName);
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
				await this.saveAndRefresh();
			},
			onCardAdd: async (columnName: string) => {
				if (!this.data) return;
				const col = this.data.columns.find(c => c.name === columnName);
				if (!col) return;

				const effectiveType = col.sectionType ?? col.name.toLowerCase();

				if (effectiveType === 'dashboard') {
					this.openWidgetTypeModal(columnName);
				} else if (effectiveType === 'memo' || effectiveType === 'todo') {
					const newCard: DashboardCard = {
						id: `${Date.now()}-new`,
						title: effectiveType === 'memo' ? t('default.memoTitle', { date: '' }) : t('default.todoTitle1'),
						type: effectiveType === 'memo' ? 'generic' : 'task',
						column: columnName,
						body: '',
						tasks: effectiveType === 'todo' ? [{ text: '', checked: false }] : [],
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
					await this.saveAndRefresh();
				} else {
					this.openProjectSearchModal(columnName);
				}
			},
			onColumnAdd: async (name: string, sectionType?: string) => {
				if (!this.data) return;
				this.data.columns.push({
					name,
					color: '#6366f1',
					sectionType: sectionType || 'project',
					cards: [],
				});
				await this.saveAndRefresh();
			},
			onBannerEdit: () => this.openBannerEditModal(),
			onQuickActionAdd: () => this.openAddActionModal(),
			onQuickActionRemove: async (index: number) => {
				const confirmed = await showConfirmDialog(this.app, {
					title: t('common.confirmDelete'),
					message: t('common.confirmDeleteMessage'),
				});
				if (confirmed && this.data) {
					this.data.quickActions.splice(index, 1);
					await this.saveAndRefresh();
				}
			},
			onMoveCard: async (cardId: string, targetColumn: string, targetIndex: number) => {
				if (!this.data) return;
				let movedCard: DashboardCard | null = null;
				for (const col of this.data.columns) {
					const idx = col.cards.findIndex(c => c.id === cardId);
					if (idx !== -1) { [movedCard] = col.cards.splice(idx, 1); break; }
				}
				if (!movedCard) return;
				const destCol = this.data.columns.find(c => c.name === targetColumn);
				if (destCol) {
					movedCard.column = targetColumn;
					destCol.cards.splice(targetIndex, 0, movedCard);
					await this.saveAndRefresh();
				}
			},
			onMemoUpdate: async (card: DashboardCard, updates: { body: string; blockquote: string }) => {
				const found = this.findCard(card.id);
				if (found) {
					found.card.body = updates.body;
					found.card.blockquote = updates.blockquote;
					await this.saveAndRefresh();
				}
			},
			onProjectDocsUpdate: async (card: DashboardCard, docPaths: string[]) => {
				const found = this.findCard(card.id);
				if (found) {
					found.card.projectDocs = docPaths.map(p => ({ path: p, children: [] }));
					await this.saveAndRefresh();
				}
			},
			onProjectDocsReorder: async (cardId: string, from: number, to: number) => {
				const found = this.findCard(cardId);
				if (found && found.card.projectDocs) {
					const [item] = found.card.projectDocs.splice(from, 1);
					found.card.projectDocs.splice(to, 0, item);
					await this.saveAndRefresh();
				}
			},
			onDocMoveToCard: async (srcCardId: string, docIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = this.findCard(srcCardId);
				const destFound = this.findCard(destCardId);
				if (srcFound?.card.projectDocs && destFound) {
					const [doc] = srcFound.card.projectDocs.splice(docIndex, 1);
					if (!destFound.card.projectDocs) destFound.card.projectDocs = [];
					destFound.card.projectDocs.splice(destIndex, 0, doc);
					await this.saveAndRefresh();
				}
			},
			onProjectDocsAdd: async (card: DashboardCard, docPath: string) => {
				const found = this.findCard(card.id);
				if (found) {
					if (!found.card.projectDocs) found.card.projectDocs = [];
					found.card.projectDocs.push({ path: docPath, children: [] });
					await this.saveAndRefresh();
				}
			},
			onProjectDocsRemove: async (card: DashboardCard, topIndex: number) => {
				const found = this.findCard(card.id);
				if (found?.card.projectDocs) {
					found.card.projectDocs.splice(topIndex, 1);
					await this.saveAndRefresh();
				}
			},
			onMemoColorChange: async (card: DashboardCard, color: string) => {
				const found = this.findCard(card.id);
				if (found) { found.card.color = color; await this.saveAndRefresh(); }
			},
			onProjectCoverChange: async (card: DashboardCard, imagePath: string) => {
				const found = this.findCard(card.id);
				if (found) { found.card.coverImage = imagePath; await this.saveAndRefresh(); }
			},
			onCardTitleEdit: async (cardId: string, newTitle: string) => {
				const found = this.findCard(cardId);
				if (found) { found.card.title = newTitle; await this.saveAndRefresh(); }
			},
			onCardWidthChange: async (cardId: string, width: number) => {
				const found = this.findCard(cardId);
				if (found) { found.card.width = width; await this.saveAndRefresh(); }
			},
			onCardSizeChange: async (cardId: string, size: string) => {
				const found = this.findCard(cardId);
				if (found) { found.card.size = size as import('./types').CardSize; await this.saveAndRefresh(); }
			},
			onCardGridChange: async (cardId: string, gridCols: number, gridRows: number) => {
				const found = this.findCard(cardId);
				if (found) { found.card.gridCols = gridCols; found.card.gridRows = gridRows; await this.saveAndRefresh(); }
			},
			onCardGridMove: async (cardId: string, gridCol: number, gridRow: number) => {
				const found = this.findCard(cardId);
				if (found) { found.card.gridCol = gridCol; found.card.gridRow = gridRow; await this.saveAndRefresh(); }
			},
			onFileDrop: async (cardId: string, filePath: string) => {
				if (!this.data) return;
				const found = this.findCard(cardId);
				if (!found) return;

				const col = this.data.columns.find(c => c.name === found.card.column);
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
				await this.saveAndRefresh();
			},
			onProjectItemReorder: async (cardId: string, fromIndex: number, toIndex: number) => {
				const found = this.findCard(cardId);
				if (found?.card.projectDocs) {
					const [item] = found.card.projectDocs.splice(fromIndex, 1);
					found.card.projectDocs.splice(toIndex, 0, item);
					await this.saveAndRefresh();
				}
			},
			onProjectItemMoveToCard: async (srcCardId: string, itemIndex: number, destCardId: string, destIndex: number) => {
				const srcFound = this.findCard(srcCardId);
				const destFound = this.findCard(destCardId);
				if (srcFound?.card.projectDocs && destFound) {
					const [item] = srcFound.card.projectDocs.splice(itemIndex, 1);
					if (!destFound.card.projectDocs) destFound.card.projectDocs = [];
					destFound.card.projectDocs.splice(destIndex, 0, item);
					await this.saveAndRefresh();
				}
			},
			onColumnRename: async (oldName: string, newName: string) => {
				const col = this.data?.columns.find(c => c.name === oldName);
				if (col) { col.name = newName; await this.saveAndRefresh(); }
			},
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
				if (confirmed && this.data) {
					const idx = this.data.columns.findIndex(c => c.name === columnName);
					if (idx !== -1) { this.data.columns.splice(idx, 1); await this.saveAndRefresh(); }
				}
			},
			onColumnSectionTypeChange: async (columnName: string, sectionType: string) => {
				const col = this.data?.columns.find(c => c.name === columnName);
				if (col) { col.sectionType = sectionType; await this.saveAndRefresh(); }
			},
			onTaskReminderEdit: async (cardId: string, taskIndex: number, reminder: string | undefined) => {
				const found = this.findCard(cardId);
				if (found && found.card.tasks[taskIndex]) {
					found.card.tasks[taskIndex].reminder = reminder;
					await this.saveAndRefresh();
				}
			},
			onAddFromTemplate: (columnName: string) => this.openTemplatePicker(columnName),
			onLibraryConfigChange: (columnName: string) => this.openLibraryConfigModal(columnName),
		};
	}

	/** Find a card by ID across all columns */
	private findCard(cardId: string): { col: import('./types').DashboardColumn; card: DashboardCard } | null {
		if (!this.data) return null;
		for (const col of this.data.columns) {
			const card = col.cards.find(c => c.id === cardId);
			if (card) return { col, card };
		}
		return null;
	}

	private deleteCardById(cardId: string): void {
		if (!this.data) return;
		for (const col of this.data.columns) {
			const idx = col.cards.findIndex(c => c.id === cardId);
			if (idx !== -1) { col.cards.splice(idx, 1); break; }
		}
	}

	private async saveAndRefresh(): Promise<void> {
		await this.saveToNote();
		this.render();
	}

	// --- Modals ---

	private openBannerEditModal(): void {
		if (!this.data) return;
		const modal = new BannerEditModal(this.app, this.data.banner, async (updates) => {
			Object.assign(this.data!.banner, updates);
			await this.saveAndRefresh();
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openWidgetTypeModal(colName: string): void {
		const modal = new WidgetTypeModal(this.app, (type: WidgetType) => {
			if (type === 'weather') this.openWeatherConfigModal(colName);
			else if (type === 'tracker') this.openTrackerConfigModal(colName);
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openWeatherConfigModal(colName: string): void {
		const modal = new WeatherConfigModal(this.app, async (title, config) => {
			if (!this.data) return;
			const col = this.data.columns.find(c => c.name === colName);
			if (!col) return;
			col.cards.push({
				id: `${Date.now()}-weather`,
				title,
				type: 'weather',
				column: colName,
				body: '',
				tasks: [], url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
				blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
				gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
				weatherConfig: config,
			});
			await this.saveAndRefresh();
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openTrackerConfigModal(colName: string): void {
		const modal = new TrackerConfigModal(this.app, async (title, config) => {
			if (!this.data) return;
			const col = this.data.columns.find(c => c.name === colName);
			if (!col) return;
			col.cards.push({
				id: `${Date.now()}-tracker`,
				title,
				type: 'tracker',
				column: colName,
				body: '',
				tasks: [], url: '', wikiLink: '', progress: -1, streak: 0, dueDate: '',
				blockquote: '', color: '', coverImage: '', width: 0, size: 'M',
				gridCols: 0, gridRows: 0, gridCol: 0, gridRow: 0,
				trackerConfig: config,
			});
			await this.saveAndRefresh();
		}, this.plugin.settings.stylePreset);
		modal.open();
	}

	private openProjectSearchModal(colName: string): void {
		const modal = new DocSearchModal(this.app, (link) => {
			if (!this.data) return;
			const col = this.data.columns.find(c => c.name === colName);
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
			this.saveAndRefresh();
		});
		modal.open();
	}

	private openTemplatePicker(colName: string): void {
		const modal = new TemplatePickerModal(
			this.app,
			this.plugin,
			(template) => {
				if (!this.data) return;
				const col = this.data.columns.find(c => c.name === colName);
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
				this.saveAndRefresh();
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
				const col = this.data?.columns.find(c => c.name === colName);
				if (col) { col.libraryConfig = config; this.saveAndRefresh(); }
			},
		);
		modal.open();
	}

	private openAddActionModal(): void {
		const modal = new AddActionModal(this.app, async (action) => {
			if (!this.data) return;
			if (!this.data.quickActions) this.data.quickActions = [];
			this.data.quickActions.push(action);
			await this.saveAndRefresh();
		});
		modal.open();
	}

	private async removeQuickAction(index: number): Promise<void> {
		if (!this.data) return;
		this.data.quickActions.splice(index, 1);
		await this.saveAndRefresh();
	}

	private removeQuickActionByKey(key: string): void {
		if (!this.data) return;
		this.data.quickActions = this.data.quickActions.filter(a =>
			!(a.type === 'file' && a.target === key) && !(a.type === 'command' && a.target === key)
		);
		this.saveAndRefresh();
	}

	private reorderQuickActions(order: string[]): void {
		if (!this.data) return;
		this.data.quickActionOrder = order;
		this.saveAndRefresh();
	}

	// --- Navigation & Actions ---

	private async executeAction(action: import('./types').QuickAction): Promise<void> {
		if (action.type === 'file') {
			await this.navigateToPath(action.target);
		} else if (action.type === 'command') {
			if (action.target === 'daily-notes') {
				await this.createNewJournal();
			} else {
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

	private async navigateToPath(path: string): Promise<void> {
		let file = this.app.vault.getFileByPath(path);
		if (!file && !path.endsWith('.md')) {
			file = this.app.vault.getFileByPath(`${path}.md`);
		}
		if (!file) {
			const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			file = this.app.vault.getMarkdownFiles().find(mf => mf.basename === basename);
		}
		if (file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}
	}

	// --- Vault Listeners ---

	private registerVaultListeners(): void {
		const events = this.app.vault;
		const handler = () => {
			// Reload note when file changes externally
			if (this.notePath) {
				this.loadNoteData();
			}
		};

		const modifyRef = events.on('modify', (file) => {
			if (file instanceof TFile && file.path === this.notePath) {
				// Debounced reload
				setTimeout(() => this.loadNoteData(), 300);
			}
		});

		this.vaultEventRefs = [
			{ evt: events, ref: modifyRef },
		];
	}

	private unregisterVaultListeners(): void {
		for (const { evt, ref } of this.vaultEventRefs) {
			evt.offref(ref as Parameters<typeof evt.offref>[0]);
		}
		this.vaultEventRefs = [];
	}

	private runCleanup(): void {
		destroyAllCharts();
		if (this.pomodoroService) {
			this.pomodoroService.setOnTick(null);
		}
		if (this.readingService) {
			this.readingService.setOnTick(null);
		}
		for (const fn of this.cleanupFns) fn();
		this.cleanupFns = [];
	}
}
