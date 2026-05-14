import { App, TFile } from 'obsidian';
import type { DashboardSettings, DashboardCard, DashboardData, TaskItem, QuickLink, BannerData, CardType } from './types';
import { parse, serialize, generateDefaultMarkdown } from './parser';
import { t } from './i18n';

type DataCallback = (data: DashboardData) => void;

const KNOWN_METADATA_KEYS = new Set(['link', 'progress', 'due', 'streak', 'type']);

export class SyncEngine {
	private app: App;
	private settings: DashboardSettings;
	private file: TFile | null = null;
	private data: DashboardData | null = null;
	private lastWrittenHash = '';
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly debounceMs = 300;
	private writeQueue: Promise<void> = Promise.resolve();
	private callbacks: DataCallback[] = [];
	private eventRef: ReturnType<typeof this.app.vault.on> | null = null;

	constructor(app: App, settings: DashboardSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: DashboardSettings): void {
		this.settings = settings;
	}

	onDataUpdate(cb: DataCallback): void {
		this.callbacks.push(cb);
	}

	async init(): Promise<void> {
		await this.findOrCreateFile();
		this.registerFileWatcher();
		await this.load();
	}

	destroy(): void {
		if (this.eventRef) {
			this.app.vault.offref(this.eventRef!);
			this.eventRef = null;
		}
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
	}

	getData(): DashboardData | null {
		return this.data;
	}

	async refresh(): Promise<void> {
		await this.load();
	}

	async toggleTask(cardId: string, taskIndex: number, checked: boolean): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card => {
					if (card.id !== cardId) return card;
					if (taskIndex >= card.tasks.length) return card;
					const newTasks: TaskItem[] = card.tasks.map((t, i) =>
						i === taskIndex ? { ...t, checked } : t
					);
					return { ...card, tasks: newTasks };
				}),
			})),
		};
		await this.writeToDisk();
	}

	async reorderTask(cardId: string, fromIndex: number, toIndex: number): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card => {
					if (card.id !== cardId) return card;
					if (fromIndex < 0 || fromIndex >= card.tasks.length) return card;
					if (toIndex < 0 || toIndex >= card.tasks.length) return card;
					const tasks = [...card.tasks];
					const moved = tasks[fromIndex]!;
					tasks.splice(fromIndex, 1);
					tasks.splice(toIndex, 0, moved);
					return { ...card, tasks };
				}),
			})),
		};
		await this.writeToDisk();
	}

	async editTask(cardId: string, taskIndex: number, newText: string): Promise<void> {
		if (!this.data || !newText) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card => {
					if (card.id !== cardId) return card;
					if (taskIndex >= card.tasks.length) return card;
					const tasks = card.tasks.map((t, i) => i === taskIndex ? { ...t, text: newText } : t);
					return { ...card, tasks };
				}),
			})),
		};
		await this.writeToDisk();
	}

	async addTask(cardId: string, text: string): Promise<void> {
		if (!this.data || !text.trim()) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card => {
					if (card.id !== cardId) return card;
					return { ...card, tasks: [...card.tasks, { text: text.trim(), checked: false }] };
				}),
			})),
		};
		await this.writeToDisk();
	}

	async deleteTask(cardId: string, taskIndex: number): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card => {
					if (card.id !== cardId) return card;
					if (taskIndex >= card.tasks.length) return card;
					const newTasks = card.tasks.filter((_, i) => i !== taskIndex);
					return { ...card, tasks: newTasks };
				}),
			})),
		};
		await this.writeToDisk();
	}

	async updateCard(cardId: string, updates: Partial<Pick<DashboardCard, 'title' | 'body' | 'dueDate' | 'color' | 'coverImage'>>): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card =>
					card.id === cardId ? { ...card, ...updates } : card
				),
			})),
		};
		await this.writeToDisk();
	}

	async deleteCard(cardId: string): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.filter(c => c.id !== cardId),
			})),
		};
		await this.writeToDisk();
	}

	async addCard(columnName: string, overrides?: Partial<DashboardCard>): Promise<void> {
		if (!this.data) return;
		const cardTitle = overrides?.title ?? this.getDefaultCardTitle(columnName);
		const cardType = this.getDefaultCardType(columnName);

		const newCard: DashboardCard = {
			id: `card-${Date.now().toString(36)}`,
			title: cardTitle,
			type: cardType,
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
			...overrides,
		};

		this.data = {
			...this.data,
			columns: this.data.columns.map(col =>
				col.name === columnName
					? { ...col, cards: [...col.cards, newCard] }
					: col
			),
		};
		await this.writeToDisk();
	}

	async addColumn(name: string): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: [...this.data.columns, { name, color: '#6366f1', cards: [] }],
		};
		await this.writeToDisk();
	}

	async moveCard(cardId: string, targetColumn: string, targetIndex: number): Promise<void> {
		if (!this.data) return;

		let movedCard: DashboardCard | null = null;

		const columnsWithout = this.data.columns.map(col => {
			const idx = col.cards.findIndex(c => c.id === cardId);
			if (idx !== -1) {
				movedCard = { ...col.cards[idx]!, column: targetColumn };
				return { ...col, cards: [...col.cards.slice(0, idx), ...col.cards.slice(idx + 1)] };
			}
			return col;
		});

		if (!movedCard) return;

		const newColumns = columnsWithout.map(col => {
			if (col.name !== targetColumn) return col;
			const cards = [...col.cards];
			cards.splice(targetIndex, 0, movedCard!);
			return { ...col, cards };
		});

		this.data = { ...this.data, columns: newColumns };
		await this.writeToDisk();
	}

	async updateBanner(updates: Partial<BannerData>): Promise<void> {
		if (!this.data) return;
		this.data = {
			...this.data,
			banner: { ...this.data.banner, ...updates },
		};
		await this.writeToDisk();
	}

	async addQuickLink(link: QuickLink): Promise<void> {
		if (!this.data) return;
		this.data = {
			...this.data,
			quickLinks: [...this.data.quickLinks, link],
		};
		await this.writeToDisk();
	}

	async removeQuickLink(index: number): Promise<void> {
		if (!this.data) return;
		this.data = {
			...this.data,
			quickLinks: this.data.quickLinks.filter((_, i) => i !== index),
		};
		await this.writeToDisk();
	}

	async updateMemoCard(cardId: string, updates: { body: string; blockquote: string }): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card =>
					card.id === cardId ? { ...card, ...updates } : card
				),
			})),
		};
		await this.writeToDisk();
	}

	async reorderDocPaths(cardId: string, fromIndex: number, toIndex: number): Promise<void> {
		if (!this.data) return;

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card => {
					if (card.id !== cardId) return card;
					const paths = card.body.split('\n')
						.map(l => l.trim())
						.filter(l => l.startsWith('[[') && l.endsWith(']]'))
						.map(l => l.slice(2, -2));
					if (fromIndex < 0 || fromIndex >= paths.length) return card;
					if (toIndex < 0 || toIndex >= paths.length) return card;
					const moved = paths[fromIndex]!;
					paths.splice(fromIndex, 1);
					paths.splice(toIndex, 0, moved);
					const body = paths.map(p => `[[${p}]]`).join('\n');
					return { ...card, body };
				}),
			})),
		};
		await this.writeToDisk();
	}

	async updateProjectDocs(cardId: string, docPaths: string[]): Promise<void> {
		if (!this.data) return;

		const body = docPaths.map(p => `[[${p}]]`).join('\n');

		this.data = {
			...this.data,
			columns: this.data.columns.map(col => ({
				...col,
				cards: col.cards.map(card =>
					card.id === cardId ? { ...card, body } : card
				),
			})),
		};
		await this.writeToDisk();
	}

	async updateMemoColor(cardId: string, color: string): Promise<void> {
		await this.updateCard(cardId, { color });
	}

	async updateProjectCover(cardId: string, coverImage: string): Promise<void> {
		await this.updateCard(cardId, { coverImage });
	}

	async replaceData(newData: DashboardData): Promise<void> {
		this.data = newData;
		await this.writeToDisk();
	}

	private getDefaultCardTitle(columnName: string): string {
		const lower = columnName.toLowerCase();
		if (lower === 'memo') {
			const now = new Date();
			const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
			return t('sync.memoTitle', { date });
		}
		if (lower === 'todo') return t('sync.todoTitle');
		if (lower === 'projects') return t('sync.projectTitle');
		return t('sync.newCard');
	}

	private getDefaultCardType(columnName: string): CardType {
		const lower = columnName.toLowerCase();
		if (lower === 'todo') return 'task';
		if (lower === 'memo') return 'generic';
		return 'project';
	}

	private async findOrCreateFile(): Promise<void> {
		const rawPath = this.settings.dashboardFile.trim();
		const path = rawPath.endsWith('.md') ? rawPath : `${rawPath}.md`;
		const existing = this.app.vault.getFileByPath(path);
		if (existing) {
			this.file = existing;
			return;
		}

		const content = generateDefaultMarkdown();
		this.file = await this.app.vault.create(path, content);
	}

	private registerFileWatcher(): void {
		this.eventRef = this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file === this.file) {
				this.onFileModify();
			}
		});
	}

	private onFileModify(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.load();
		}, this.debounceMs);
	}

	private async load(): Promise<void> {
		if (!this.file) return;

		const content = await this.app.vault.cachedRead(this.file);
		const hash = simpleHash(content);
		if (hash === this.lastWrittenHash) return;

		this.data = parse(content);
		this.notifyCallbacks();
	}

	private async writeToDisk(): Promise<void> {
		if (!this.data || !this.file) return;

		const content = serialize(this.data);
		const hash = simpleHash(content);
		this.lastWrittenHash = hash;

		const fileRef = this.file;
		this.writeQueue = this.writeQueue.then(async () => {
			try {
				await this.app.vault.modify(fileRef, content);
			} catch (err) {
				console.error('Dashboard sync write failed:', err);
			}
		});

		this.notifyCallbacks();
	}

	private notifyCallbacks(): void {
		if (!this.data) return;
		for (const cb of this.callbacks) {
			cb(this.data);
		}
	}
}

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + ch;
		hash |= 0;
	}
	return hash.toString(36);
}
