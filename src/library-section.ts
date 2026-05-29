import { App, TFile, setIcon } from 'obsidian';
import type { LibraryConfig, PropertyFilter, LibraryViewMode } from './types';
import { t, getLanguage } from './i18n';

export interface LibraryFileResult {
	file: TFile;
	basename: string;
	mtime: number;
	ctime: number;
	frontmatter: Record<string, unknown>;
	preview: string;
}

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export function extractFrontmatterProperties(app: App): Map<string, Set<string>> {
	const props = new Map<string, Set<string>>();
	props.set('tags', new Set());
	props.set('modified', new Set());
	props.set('created', new Set());
	props.set('path', new Set());

	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path.startsWith('.')) continue;
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;

		const fm = cache.frontmatter;
		for (const [key, value] of Object.entries(fm)) {
			if (key === 'position') continue;
			if (!props.has(key)) props.set(key, new Set());
			const set = props.get(key)!;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item != null) set.add(String(item));
				}
			} else if (value != null) {
				set.add(String(value));
			}
		}

		// Tags from frontmatter and inline
		const tagsSet = props.get('tags')!;
		if (fm.tags) {
			if (Array.isArray(fm.tags)) {
				for (const tag of fm.tags) tagsSet.add(String(tag));
			} else {
				tagsSet.add(String(fm.tags));
			}
		}
		if (cache.tags) {
			for (const tag of cache.tags) tagsSet.add(tag.tag);
		}
	}

	return props;
}

export function queryVaultFiles(app: App, config: LibraryConfig): LibraryFileResult[] {
	const files = app.vault.getMarkdownFiles();
	const results: LibraryFileResult[] = [];

	for (const file of files) {
		if (file.path.startsWith('.')) continue;

		const cache = app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

		// Apply filters (AND logic)
		let matches = true;
		for (const filter of config.filters) {
			if (!evaluateFilter(file, fm, filter, cache)) {
				matches = false;
				break;
			}
		}
		if (!matches) continue;

		results.push({
			file,
			basename: file.basename,
			mtime: file.stat.mtime,
			ctime: file.stat.ctime,
			frontmatter: fm,
			preview: '',
		});
	}

	// Sort
	sortResults(results, config.sortBy, config.sortDesc);

	return results;
}

function evaluateFilter(
	file: TFile,
	fm: Record<string, unknown>,
	filter: PropertyFilter,
	cache: ReturnType<typeof import('obsidian').App.prototype.metadataCache.getFileCache>,
): boolean {
	if (filter.values.length === 0) return true;

	const prop = filter.property;

	if (prop === 'tags') {
		const fileTags: string[] = [];
		if (fm.tags) {
			if (Array.isArray(fm.tags)) {
				fileTags.push(...fm.tags.map(String));
			} else {
				fileTags.push(String(fm.tags));
			}
		}
		if (cache?.tags) {
			for (const tag of cache.tags) fileTags.push(tag.tag);
		}
		return fileTags.some(tag => filter.values.includes(tag));
	}

	if (prop === 'modified' || prop === 'created') {
		const ts = prop === 'modified' ? file.stat.mtime : file.stat.ctime;
		const dateStr = new Date(ts).toISOString().slice(0, 10);
		if (filter.dateRange) {
			if (filter.dateRange.start && dateStr < filter.dateRange.start) return false;
			if (filter.dateRange.end && dateStr > filter.dateRange.end) return false;
			return true;
		}
		return filter.values.includes(dateStr);
	}

	if (prop === 'path') {
		return filter.values.some(v => file.path.toLowerCase().includes(v.toLowerCase()));
	}

	// Frontmatter property
	const value = fm[prop];
	if (value == null) return false;

	if (Array.isArray(value)) {
		return value.some(item => filter.values.includes(String(item)));
	}

	return filter.values.includes(String(value));
}

async function loadPreview(app: App, file: TFile): Promise<string> {
	const cache = app.metadataCache.getFileCache(file);
	if (!cache?.frontmatter?.position) return '';
	const startLine = cache.frontmatter.position.end.line + 1;
	const raw = await app.vault.cachedRead(file);
	const lines = raw.split('\n');
	const previewLines: string[] = [];
	for (let i = startLine; i < lines.length && previewLines.length < 3; i++) {
		const line = lines[i]!.replace(/^#+\s*/, '').trim();
		if (line && !line.startsWith('---') && !line.startsWith('```')) previewLines.push(line);
	}
	return previewLines.join(' ').slice(0, 120);
}

function sortResults(results: LibraryFileResult[], sortBy: string, desc: boolean): void {
	results.sort((a, b) => {
		let cmp = 0;
		if (sortBy === 'name') {
			cmp = a.basename.localeCompare(b.basename);
		} else if (sortBy === 'modified') {
			cmp = a.mtime - b.mtime;
		} else if (sortBy === 'created') {
			cmp = a.ctime - b.ctime;
		} else {
			const aVal = a.frontmatter[sortBy];
			const bVal = b.frontmatter[sortBy];
			cmp = comparePropertyValues(aVal, bVal);
		}
		return desc ? -cmp : cmp;
	});
}

function comparePropertyValues(a: unknown, b: unknown): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	const sa = String(a);
	const sb = String(b);
	const na = Number(sa);
	const nb = Number(sb);
	if (!isNaN(na) && !isNaN(nb)) return na - nb;
	return sa.localeCompare(sb);
}

function formatDate(ts: number): string {
	const d = new Date(ts);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) {
		const diffH = Math.floor(diffMs / (1000 * 60 * 60));
		if (diffH === 0) {
			const diffM = Math.floor(diffMs / (1000 * 60));
			return diffM <= 1 ? t('recent.justNow') : t('recent.minutesAgo', { count: diffM });
		}
		return t('recent.hoursAgo', { count: diffH });
	}
	if (diffDays < 30) return t('recent.daysAgo', { count: diffDays });
	const lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
	return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
}

// ===== Rendering =====

export function renderLibrarySection(
	el: HTMLElement,
	column: { name: string; color: string; libraryConfig?: LibraryConfig },
	app: App,
	onConfigChange: (config: LibraryConfig) => void,
): void {
	const config = column.libraryConfig ?? {
		filters: [] as PropertyFilter[],
		viewMode: 'grid' as LibraryViewMode,
		sortBy: 'modified',
		sortDesc: true,
	};

	const sectionContent = el.createDiv({ cls: 'dashboard-library-content' });

	// Toolbar
	const toolbar = sectionContent.createDiv({ cls: 'dashboard-library-toolbar' });

	// Search
	const searchInput = toolbar.createEl('input', {
		cls: 'dashboard-library-search',
		attr: { type: 'text', placeholder: t('library.searchPlaceholder') },
	});

	// Sort
	const sortSelect = toolbar.createEl('select', { cls: 'dashboard-library-sort' });
	const sortOptions = [
		{ value: 'modified', label: t('library.sortModified') },
		{ value: 'created', label: t('library.sortCreated') },
		{ value: 'name', label: t('library.sortName') },
	];
	for (const opt of sortOptions) {
		const option = sortSelect.createEl('option', { text: opt.label, attr: { value: opt.value } });
		if (opt.value === config.sortBy) option.selected = true;
	}

	// Sort direction toggle
	const sortDirBtn = toolbar.createDiv({ cls: 'dashboard-library-sort-dir' });
	setIcon(sortDirBtn, config.sortDesc ? 'arrow-down-wide-narrow' : 'arrow-up-wide-narrow');

	// View mode toggle
	const viewToggle = toolbar.createDiv({ cls: 'dashboard-library-view-toggle' });
	const viewModes: LibraryViewMode[] = ['grid', 'list', 'table', 'kanban'];
	const viewIcons: Record<string, string> = { grid: 'layout-grid', list: 'list', table: 'table', kanban: 'columns' };
	for (const mode of viewModes) {
		const btn = viewToggle.createDiv({
			cls: 'dashboard-library-view-btn' + (mode === config.viewMode ? ' active' : ''),
		});
		setIcon(btn, viewIcons[mode] ?? 'file');
		btn.title = t('library.view' + mode.charAt(0).toUpperCase() + mode.slice(1));
		btn.dataset.viewMode = mode;
		btn.addEventListener('click', () => {
			viewToggle.querySelectorAll('.dashboard-library-view-btn').forEach(b => b.removeClass('active'));
			btn.addClass('active');
			const newConfig = { ...config, viewMode: mode };
			onConfigChange(newConfig);
			Object.assign(config, { viewMode: mode });
			currentPage = 1;
			renderContent(config);
		});
	}

		// Quick filter button
		const filterBtn = toolbar.createDiv({ cls: 'dashboard-library-filter-btn' });
		setIcon(filterBtn, 'filter');
		filterBtn.title = t('library.quickFilter');

		// Filter tags container
		const filterTags = toolbar.createDiv({ cls: 'dashboard-library-filter-tags' });

		// Filter popup
		const filterPopup = sectionContent.createDiv({ cls: 'dashboard-library-filter-popup' });
		filterPopup.style.display = 'none';

		const availableProps = extractFrontmatterProperties(app);

		function renderFilterPopup(): void {
			filterPopup.empty();

			for (let i = 0; i < config.filters.length; i++) {
				const filter = config.filters[i]!;
				const row = filterPopup.createDiv({ cls: 'dashboard-library-filter-popup-row' });

				const propSelect = row.createEl('select', { cls: 'dashboard-library-filter-popup-prop' });
				const propKeys = [...availableProps.keys()].sort();
				propSelect.createEl('option', { text: t('library.selectProperty'), attr: { value: '' } });
				for (const key of propKeys) {
					const opt = propSelect.createEl('option', { text: key, attr: { value: key } });
					if (key === filter.property) opt.selected = true;
				}
				propSelect.addEventListener('change', () => {
					filter.property = propSelect.value;
					filter.values = [];
					filter.dateRange = undefined;
					renderFilterPopup();
				});

				if (filter.property === 'created' || filter.property === 'modified') {
					const dateWrap = row.createDiv({ cls: 'dashboard-library-filter-popup-dates' });
					const startInput = dateWrap.createEl('input', {
						cls: 'dashboard-library-filter-date',
						attr: { type: 'date', placeholder: t('library.dateStart') },
					});
					if (filter.dateRange?.start) startInput.value = filter.dateRange.start;
					const endInput = dateWrap.createEl('input', {
						cls: 'dashboard-library-filter-date',
						attr: { type: 'date', placeholder: t('library.dateEnd') },
					});
					if (filter.dateRange?.end) endInput.value = filter.dateRange.end;

					const applyDates = (): void => {
						const start = startInput.value;
						const end = endInput.value;
						filter.dateRange = (start || end) ? { start, end } : undefined;
						onConfigChange({ ...config, filters: config.filters.map(f => ({ ...f })) });
						currentPage = 1;
						renderContent(config);
						renderFilterTags();
					};
					startInput.addEventListener('change', applyDates);
					endInput.addEventListener('change', applyDates);
				} else if (filter.property) {
					const valuesWrap = row.createDiv({ cls: 'dashboard-library-filter-popup-values' });
					const avail = availableProps.get(filter.property);
					if (avail && avail.size > 0) {
						for (const val of [...avail].sort().slice(0, 20)) {
							const chip = valuesWrap.createDiv({
								cls: 'dashboard-library-filter-chip' + (filter.values.includes(val) ? ' active' : ''),
								text: val,
							});
							chip.addEventListener('click', () => {
								const idx = filter.values.indexOf(val);
								if (idx >= 0) {
									filter.values = filter.values.filter(v => v !== val);
								} else {
									filter.values = [...filter.values, val];
								}
								onConfigChange({ ...config, filters: config.filters.map(f => ({ ...f })) });
								currentPage = 1;
								renderContent(config);
								renderFilterPopup();
								renderFilterTags();
							});
						}
					}
				}

				const removeBtn = row.createDiv({ cls: 'dashboard-library-filter-popup-remove' });
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', () => {
					config.filters = config.filters.filter((_, idx) => idx !== i);
					onConfigChange({ ...config, filters: config.filters.map(f => ({ ...f })) });
					currentPage = 1;
					renderContent(config);
					renderFilterPopup();
					renderFilterTags();
					updateFilterBtnState();
				});
			}

			const addBtn = filterPopup.createEl('button', {
				cls: 'dashboard-library-filter-popup-add',
				text: t('library.addFilter'),
			});
			addBtn.addEventListener('click', () => {
				config.filters = [...config.filters, { property: '', values: [], dateRange: undefined }];
				renderFilterPopup();
			});
		}

		function renderFilterTags(): void {
			filterTags.empty();
			for (let i = 0; i < config.filters.length; i++) {
				const filter = config.filters[i]!;
				if (!filter.property) continue;
				if (filter.property === 'created' || filter.property === 'modified') {
					if (!filter.dateRange?.start && !filter.dateRange?.end) continue;
					const start = filter.dateRange?.start || '...';
					const end = filter.dateRange?.end || '...';
					const tag = filterTags.createDiv({
						cls: 'dashboard-library-filter-tag',
						text: `${filter.property}: ${start} ~ ${end}`,
					});
					const x = tag.createSpan({ cls: 'dashboard-library-filter-tag-x', text: '×' });
					x.addEventListener('click', () => {
						config.filters = config.filters.filter((_, idx) => idx !== i);
						onConfigChange({ ...config, filters: config.filters.map(f => ({ ...f })) });
						currentPage = 1;
						renderContent(config);
						renderFilterPopup();
						renderFilterTags();
						updateFilterBtnState();
					});
				} else if (filter.values.length > 0) {
					const tag = filterTags.createDiv({
						cls: 'dashboard-library-filter-tag',
						text: `${filter.property}: ${filter.values.join(', ')}`,
					});
					const x = tag.createSpan({ cls: 'dashboard-library-filter-tag-x', text: '×' });
					x.addEventListener('click', () => {
						config.filters = config.filters.filter((_, idx) => idx !== i);
						onConfigChange({ ...config, filters: config.filters.map(f => ({ ...f })) });
						currentPage = 1;
						renderContent(config);
						renderFilterPopup();
						renderFilterTags();
						updateFilterBtnState();
					});
				}
			}
		}

		function updateFilterBtnState(): void {
			const hasActive = config.filters.some(f =>
				f.property && (
					(f.property === 'created' || f.property === 'modified')
						? (f.dateRange?.start || f.dateRange?.end)
						: f.values.length > 0
				)
			);
			filterBtn.classList.toggle('active', hasActive);
		}

		filterBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isVisible = filterPopup.style.display !== 'none';
			filterPopup.style.display = isVisible ? 'none' : 'block';
			if (!isVisible) renderFilterPopup();
		});

		document.addEventListener('click', (e) => {
			if (!filterPopup.contains(e.target as Node) && !filterBtn.contains(e.target as Node)) {
				filterPopup.style.display = 'none';
			}
		});

		// Initial render of tags and button state
		renderFilterTags();
		updateFilterBtnState();


	// Spacer
	toolbar.createDiv({ cls: 'dashboard-library-toolbar-spacer' });

	// File count
	const countEl = toolbar.createDiv({ cls: 'dashboard-library-count' });

	// Page size selector
	const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
	const pageSizeSelect = toolbar.createEl('select', { cls: 'dashboard-library-page-size' });
	for (const size of PAGE_SIZE_OPTIONS) {
		const opt = pageSizeSelect.createEl('option', { text: t('library.pageSize', { count: size }), attr: { value: String(size) } });
		if (size === pageSize) opt.selected = true;
	}
	pageSizeSelect.addEventListener('change', () => {
		const newSize = parseInt(pageSizeSelect.value) || DEFAULT_PAGE_SIZE;
		Object.assign(config, { pageSize: newSize });
		onConfigChange({ ...config });
		currentPage = 1;
		renderContent(config);
	});

	// Configure button
	const configBtn = toolbar.createDiv({ cls: 'dashboard-library-config-btn' });
	setIcon(configBtn, 'settings');
	configBtn.title = t('library.configure');

	// Content area
	const contentArea = sectionContent.createDiv({ cls: 'dashboard-library-files' });

	// Pagination area
	const paginationArea = sectionContent.createDiv({ cls: 'dashboard-library-pagination' });

	let currentPage = 1;

	function renderContent(currentConfig: LibraryConfig): void {
		contentArea.empty();
		paginationArea.empty();

		let results = queryVaultFiles(app, currentConfig);

		// Apply search
		const search = searchInput.value.trim().toLowerCase();
		if (search) {
			results = results.filter(r => r.basename.toLowerCase().includes(search));
		}

		const totalResults = results.length;
		countEl.textContent = t('library.fileCount', { count: totalResults });

		if (totalResults === 0 && currentConfig.filters.length === 0) {
			contentArea.createDiv({ cls: 'dashboard-library-empty', text: t('library.noConfig') });
			return;
		}

		if (totalResults === 0) {
			contentArea.createDiv({ cls: 'dashboard-library-empty', text: t('library.noFiles') });
			return;
		}

		// Paginate
		const effectivePageSize = currentConfig.pageSize ?? DEFAULT_PAGE_SIZE;
		const totalPages = Math.ceil(totalResults / effectivePageSize);
		if (currentPage > totalPages) currentPage = totalPages;
		if (currentPage < 1) currentPage = 1;

		const startIdx = (currentPage - 1) * effectivePageSize;
		const endIdx = Math.min(startIdx + effectivePageSize, totalResults);
		const pageResults = results.slice(startIdx, endIdx);

		switch (currentConfig.viewMode) {
			case 'grid':
				renderGridView(contentArea, pageResults, app);
				break;
			case 'list':
				renderListView(contentArea, pageResults, app);
				break;
			case 'table':
				renderTableView(contentArea, pageResults, app, currentConfig);
				break;
			case 'kanban':
				renderKanbanView(contentArea, pageResults, app, currentConfig);
				break;
		}

		// Render pagination controls
		if (totalPages > 1) {
			renderPagination(paginationArea, currentPage, totalPages, totalResults, (page) => {
				currentPage = page;
				renderContent(currentConfig);
				// Scroll to top of section content
				sectionContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			});
		}
	}

	// Search handler
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	searchInput.addEventListener('input', () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			currentPage = 1;
			renderContent(config);
		}, 200);
	});

	// Sort handlers
	sortSelect.addEventListener('change', () => {
		config.sortBy = sortSelect.value;
		onConfigChange(config);
		currentPage = 1;
		renderContent(config);
	});

	sortDirBtn.addEventListener('click', () => {
		config.sortDesc = !config.sortDesc;
		setIcon(sortDirBtn, config.sortDesc ? 'arrow-down-wide-narrow' : 'arrow-up-wide-narrow');
		onConfigChange(config);
		currentPage = 1;
		renderContent(config);
	});

	// Config button handler - will be wired in view.ts via custom event
	configBtn.addEventListener('click', () => {
		const event = new CustomEvent('dashboard-library-config', { detail: { columnName: column.name }, bubbles: true });
		el.dispatchEvent(event);
	});

	// Initial render
	renderContent(config);
}

function renderPagination(
	container: HTMLElement,
	currentPage: number,
	totalPages: number,
	totalResults: number,
	onPageChange: (page: number) => void,
): void {
	const nav = container.createDiv({ cls: 'dashboard-library-pagination-nav' });

	// Previous button
	const prevBtn = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage <= 1 ? ' disabled' : ''),
		text: '<',
	});
	if (currentPage > 1) {
		prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
	}

	// Page buttons
	const maxVisible = 5;
	let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
	const endPage = Math.min(totalPages, startPage + maxVisible - 1);
	startPage = Math.max(1, endPage - maxVisible + 1);

	if (startPage > 1) {
		const firstBtn = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: '1' });
		firstBtn.addEventListener('click', () => onPageChange(1));
		if (startPage > 2) {
			nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		}
	}

	for (let i = startPage; i <= endPage; i++) {
		const pageBtn = nav.createDiv({
			cls: 'dashboard-library-pagination-page' + (i === currentPage ? ' active' : ''),
			text: String(i),
		});
		if (i !== currentPage) {
			pageBtn.addEventListener('click', () => onPageChange(i));
		}
	}

	if (endPage < totalPages) {
		if (endPage < totalPages - 1) {
			nav.createDiv({ cls: 'dashboard-library-pagination-ellipsis', text: '...' });
		}
		const lastBtn = nav.createDiv({ cls: 'dashboard-library-pagination-page', text: String(totalPages) });
		lastBtn.addEventListener('click', () => onPageChange(totalPages));
	}

	// Next button
	const nextBtn = nav.createDiv({
		cls: 'dashboard-library-pagination-btn' + (currentPage >= totalPages ? ' disabled' : ''),
		text: '>',
	});
	if (currentPage < totalPages) {
		nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
	}
}

function openFile(app: App, file: TFile): void {
	app.workspace.getLeaf(false).openFile(file);
}

function renderBadgeRow(container: HTMLElement, fm: Record<string, unknown>, maxBadges = 5): void {
	const badgeWrap = container.createDiv({ cls: 'dashboard-library-badges' });
	let count = 0;
	for (const [key, value] of Object.entries(fm)) {
		if (key === 'position' || count >= maxBadges) break;
		if (value == null) continue;
		const badge = badgeWrap.createDiv({ cls: 'dashboard-library-badge' });
		badge.createSpan({ cls: 'dashboard-library-badge-key', text: key });
		if (Array.isArray(value)) {
			badge.createSpan({ cls: 'dashboard-library-badge-val', text: value.map(String).join(', ') });
		} else {
			badge.createSpan({ cls: 'dashboard-library-badge-val', text: String(value) });
		}
		count++;
	}
}

function renderGridView(container: HTMLElement, results: LibraryFileResult[], app: App): void {
	const grid = container.createDiv({ cls: 'dashboard-library-grid' });

	for (const result of results) {
		const card = grid.createDiv({ cls: 'dashboard-library-card' });
		card.addEventListener('click', () => openFile(app, result.file));

		card.createDiv({ cls: 'dashboard-library-card-title', text: result.basename });

		// Path + creation time on same row
		const metaRow = card.createDiv({ cls: 'dashboard-library-card-meta' });
		const parts = result.file.path.split('/');
		if (parts.length > 1) {
			metaRow.createDiv({ cls: 'dashboard-library-card-path', text: parts.slice(0, -1).join('/') + '/' });
		}
		metaRow.createDiv({ cls: 'dashboard-library-card-date', text: formatDate(result.ctime) });

		// Async body preview
		const previewEl = card.createDiv({ cls: 'dashboard-library-card-preview dashboard-library-card-preview--loading' });
		loadPreview(app, result.file).then(text => {
			if (!previewEl.isConnected) return;
			previewEl.removeClass('dashboard-library-card-preview--loading');
			if (text) {
				previewEl.textContent = text;
			} else {
				previewEl.remove();
			}
		}).catch(() => {
			if (previewEl.isConnected) previewEl.remove();
		});
	}
}

function renderListView(container: HTMLElement, results: LibraryFileResult[], app: App): void {
	const list = container.createDiv({ cls: 'dashboard-library-list' });

	for (const result of results) {
		const item = list.createDiv({ cls: 'dashboard-library-list-item' });
		item.addEventListener('click', () => openFile(app, result.file));

		item.createDiv({ cls: 'dashboard-library-list-name', text: result.basename });
		const spacer = item.createDiv({ cls: 'dashboard-library-list-spacer' });
		item.createDiv({ cls: 'dashboard-library-list-date', text: formatDate(result.ctime) });
	}
}

function startCellEdit(
	td: HTMLElement,
	file: TFile,
	prop: string,
	originalValue: unknown,
	app: App,
): void {
	if (td.querySelector('input, select')) return;

	const isArr = Array.isArray(originalValue);
	const displayValue = originalValue == null ? '' : isArr
		? (originalValue as unknown[]).map(String).join(', ')
		: String(originalValue);

	td.empty();
	td.removeClass('dashboard-library-table-empty');

	const input = td.createEl('input', {
		cls: 'dashboard-library-table-edit-input',
		attr: { type: 'text', value: displayValue },
	});
	input.focus();
	input.select();

	const finish = (save: boolean) => {
		if (!input.isConnected) return;
		const raw = input.value.trim();
		input.remove();

		if (!save) {
			td.textContent = displayValue || '—';
			if (!displayValue) td.addClass('dashboard-library-table-empty');
			return;
		}

		// Parse value
		let newValue: unknown;
		if (raw === '') {
			newValue = null;
		} else if (isArr) {
			newValue = raw.split(',').map(s => s.trim()).filter(Boolean);
		} else {
			const num = Number(raw);
			newValue = !isNaN(num) && raw !== '' ? num : raw;
		}

		// Write via processFrontMatter
		app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (newValue === null) {
				delete fm[prop];
			} else {
				fm[prop] = newValue;
			}
		});

		// Update display
		if (newValue === null) {
			td.textContent = '—';
			td.addClass('dashboard-library-table-empty');
		} else if (Array.isArray(newValue)) {
			td.textContent = newValue.join(', ');
		} else {
			td.textContent = String(newValue);
		}
	};

	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') { e.preventDefault(); finish(true); }
		else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
	});
	input.addEventListener('blur', () => finish(true));
}

function renderTableView(container: HTMLElement, results: LibraryFileResult[], app: App, config: LibraryConfig): void {
	// Determine which property columns to show
	const propKeys = new Set<string>();
	for (const filter of config.filters) {
		if (filter.property !== 'tags' && filter.property !== 'modified' && filter.property !== 'created' && filter.property !== 'path') {
			propKeys.add(filter.property);
		}
	}
	// Also collect common properties from results
	for (const result of results.slice(0, 20)) {
		for (const key of Object.keys(result.frontmatter)) {
			if (key === 'position') continue;
			propKeys.add(key);
			if (propKeys.size >= 6) break;
		}
	}

	const columns = ['name', 'modified', ...propKeys];

	const table = container.createEl('table', { cls: 'dashboard-library-table' });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	for (const col of columns) {
		const th = headerRow.createEl('th', {
			text: col === 'name' ? t('library.sortName') : col === 'modified' ? t('library.sortModified') : col,
		});
		th.dataset.sortKey = col;
	}

	const tbody = table.createEl('tbody');
	for (const result of results) {
		const tr = tbody.createEl('tr');

		for (const col of columns) {
			const td = tr.createEl('td');
			if (col === 'name') {
				td.textContent = result.basename;
				td.addClass('dashboard-library-table-name');
				td.addEventListener('click', (e) => {
					e.stopPropagation();
					openFile(app, result.file);
				});
			} else if (col === 'modified') {
				td.textContent = formatDate(result.mtime);
			} else {
				const value = result.frontmatter[col];
				if (value == null) {
					td.addClass('dashboard-library-table-empty');
					td.textContent = '—';
				} else if (Array.isArray(value)) {
					td.textContent = value.map(String).join(', ');
				} else {
					td.textContent = String(value);
				}
				td.addClass('dashboard-library-table-editable');
				td.addEventListener('dblclick', (e) => {
					e.stopPropagation();
					startCellEdit(td, result.file, col, value, app);
				});
			}
		}
	}
}

function renderKanbanView(container: HTMLElement, results: LibraryFileResult[], app: App, config: LibraryConfig): void {
	const groupBy = config.kanbanGroupBy ?? config.filters[0]?.property ?? 'tags';
	const kanban = container.createDiv({ cls: 'dashboard-library-kanban' });

	// Group results
	const groups = new Map<string, LibraryFileResult[]>();
	const noGroup: LibraryFileResult[] = [];

	for (const result of results) {
		const value = result.frontmatter[groupBy];
		if (value == null) {
			noGroup.push(result);
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				const key = String(v);
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key)!.push(result);
			}
		} else {
			const key = String(value);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(result);
		}
	}

	// Render columns
	for (const [groupName, groupResults] of groups) {
		const col = kanban.createDiv({ cls: 'dashboard-library-kanban-col' });
		col.createDiv({ cls: 'dashboard-library-kanban-col-title', text: `${groupName} (${groupResults.length})` });
		for (const result of groupResults) {
			const card = col.createDiv({ cls: 'dashboard-library-kanban-card' });
			card.addEventListener('click', () => openFile(app, result.file));
			card.createDiv({ cls: 'dashboard-library-kanban-card-title', text: result.basename });
			card.createDiv({ cls: 'dashboard-library-kanban-card-date', text: formatDate(result.mtime) });
		}
	}

	if (noGroup.length > 0) {
		const col = kanban.createDiv({ cls: 'dashboard-library-kanban-col' });
		col.createDiv({ cls: 'dashboard-library-kanban-col-title', text: `${t('library.notSet')} (${noGroup.length})` });
		for (const result of noGroup) {
			const card = col.createDiv({ cls: 'dashboard-library-kanban-card' });
			card.addEventListener('click', () => openFile(app, result.file));
			card.createDiv({ cls: 'dashboard-library-kanban-card-title', text: result.basename });
		}
	}
}
