import type DashboardPlugin from './main';

export interface BookInfo {
	title: string;
	author: string;
	coverUrl: string;
	isbn?: string;
	source?: string;
	totalPages: number;
	currentPage: number;
	finished: boolean;
	totalSeconds: number;
	sessions: number;
}

export interface ReadingState {
	status: 'idle' | 'running' | 'paused';
	currentBook: BookInfo | null;
	elapsedSeconds: number;
	sessionStartTime: number | null;
}

export interface ReadingRecord {
	bookTitle: string;
	timestamp: number;
	durationSeconds: number;
}

const STORAGE_KEY = 'apex-dashboard-reading-records';
const BOOKS_KEY = 'apex-dashboard-reading-books';

export class ReadingService {
	private plugin: DashboardPlugin;
	private state: ReadingState;
	private timerInterval: ReturnType<typeof setInterval> | null = null;
	private onTickCallback: (() => void) | null = null;
	private records: ReadingRecord[] = [];
	private activeBooks: BookInfo[] = [];

	constructor(plugin: DashboardPlugin) {
		this.plugin = plugin;
		this.state = {
			status: 'idle',
			currentBook: null,
			elapsedSeconds: 0,
			sessionStartTime: null,
		};
	}

	// ---- State accessors ----

	getState(): ReadingState {
		return { ...this.state, currentBook: this.state.currentBook ? { ...this.state.currentBook } : null };
	}

	getActiveBooks(): BookInfo[] {
		return this.activeBooks;
	}

	getTodaySecondsForBook(title: string): number {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStart = today.getTime();
		return this.records
			.filter(r => r.bookTitle === title && r.timestamp >= todayStart)
			.reduce((sum, r) => sum + r.durationSeconds, 0);
	}

	getElapsedSeconds(): number {
		return this.state.elapsedSeconds;
	}

	// ---- Timer controls ----

	startReading(book: BookInfo): void {
		// If already running for a different book, stop first
		if (this.state.status === 'running' || this.state.status === 'paused') {
			this.stopTimer();
		}

		this.state.status = 'running';
		this.state.currentBook = book;
		this.state.elapsedSeconds = 0;
		this.state.sessionStartTime = Date.now();

		this.timerInterval = setInterval(() => {
			this.state.elapsedSeconds++;
			this.onTickCallback?.();
		}, 1000);
	}

	pause(): void {
		if (this.state.status !== 'running') return;
		this.state.status = 'paused';
		this.stopTimer();
	}

	resume(): void {
		if (this.state.status !== 'paused') return;
		this.state.status = 'running';

		this.timerInterval = setInterval(() => {
			this.state.elapsedSeconds++;
			this.onTickCallback?.();
		}, 1000);
	}

	async discardSession(): Promise<void> {
		this.stopTimer();
		this.state = {
			status: 'idle',
			currentBook: null,
			elapsedSeconds: 0,
			sessionStartTime: null,
		};
	}

	async finishSession(endPage: number, totalPages: number, finished: boolean): Promise<void> {
		const book = this.state.currentBook;
		if (!book) return;

		const elapsed = this.state.elapsedSeconds;

		// Record the session
		if (elapsed > 0) {
			const record: ReadingRecord = {
				bookTitle: book.title,
				timestamp: Date.now(),
				durationSeconds: elapsed,
			};
			this.records.push(record);
			await this.saveRecords();
		}

		// Update book info
		book.currentPage = endPage;
		book.totalPages = totalPages;
		book.finished = finished;
		book.totalSeconds += elapsed;
		book.sessions += 1;

		await this.saveBooks();

		this.stopTimer();
		this.state = {
			status: 'idle',
			currentBook: null,
			elapsedSeconds: 0,
			sessionStartTime: null,
		};
	}

	// ---- Book management ----

	async addActiveBook(book: BookInfo): Promise<void> {
		// Avoid duplicates
		const existing = this.activeBooks.find(b => b.title === book.title);
		if (existing) {
			// Update existing book info
			Object.assign(existing, book);
		} else {
			this.activeBooks.push(book);
		}
		await this.saveBooks();
	}

	async removeActiveBook(title: string): Promise<void> {
		this.activeBooks = this.activeBooks.filter(b => b.title !== title);
		await this.saveBooks();
	}

	async updateBookInfo(oldTitle: string, updates: Partial<BookInfo>): Promise<void> {
		const book = this.activeBooks.find(b => b.title === oldTitle);
		if (!book) return;

		Object.assign(book, updates);

		// If title changed, update records
		if (updates.title && updates.title !== oldTitle) {
			for (const r of this.records) {
				if (r.bookTitle === oldTitle) {
					r.bookTitle = updates.title;
				}
			}
			await this.saveRecords();
		}

		await this.saveBooks();
	}

	// ---- Stats ----

	getTotalSeconds(): number {
		return this.records.reduce((sum, r) => sum + r.durationSeconds, 0);
	}

	getTodaySeconds(): number {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStart = today.getTime();
		return this.records
			.filter(r => r.timestamp >= todayStart)
			.reduce((sum, r) => sum + r.durationSeconds, 0);
	}

	getBookCountInRange(days: number): number {
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		const bookSet = new Set<string>();
		for (const r of this.records) {
			if (r.timestamp >= cutoff) {
				bookSet.add(r.bookTitle);
			}
		}
		return bookSet.size;
	}

	getStreak(): number {
		if (this.records.length === 0) return 0;

		// Get unique days with records, sorted descending
		const days = new Set<string>();
		for (const r of this.records) {
			const d = new Date(r.timestamp);
			days.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
		}
		const sortedDays = [...days].sort().reverse();

		const now = new Date();
		const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

		let streak = 0;
		const checkDate = new Date(now);
		checkDate.setHours(0, 0, 0, 0);

		// Check if today has records
		if (sortedDays[0] === today) {
			streak = 1;
			checkDate.setDate(checkDate.getDate() - 1);
		} else {
			// Check if yesterday has records
			checkDate.setDate(checkDate.getDate() - 1);
			const yesterday = `${checkDate.getFullYear()}-${checkDate.getMonth() + 1}-${checkDate.getDate()}`;
			if (sortedDays[0] === yesterday || sortedDays[0] === today) {
				streak = 1;
				if (sortedDays[0] === yesterday) {
					checkDate.setDate(checkDate.getDate() - 1);
				} else {
					checkDate.setDate(checkDate.getDate() - 2);
				}
			} else {
				return 0;
			}
		}

		// Count consecutive days backwards
		while (true) {
			const dateStr = `${checkDate.getFullYear()}-${checkDate.getMonth() + 1}-${checkDate.getDate()}`;
			if (days.has(dateStr)) {
				streak++;
				checkDate.setDate(checkDate.getDate() - 1);
			} else {
				break;
			}
		}

		return streak;
	}

	getBookBreakdownInRange(days: number): BookInfo[] {
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		const bookMap = new Map<string, { totalSeconds: number; sessions: number }>();

		for (const r of this.records) {
			if (r.timestamp >= cutoff) {
				const existing = bookMap.get(r.bookTitle) || { totalSeconds: 0, sessions: 0 };
				existing.totalSeconds += r.durationSeconds;
				existing.sessions++;
				bookMap.set(r.bookTitle, existing);
			}
		}

		// Merge with activeBooks to get coverUrl, author, etc.
		const result: BookInfo[] = [];
		for (const [title, stats] of bookMap) {
			const book = this.activeBooks.find(b => b.title === title);
			result.push({
				title,
				author: book?.author || '',
				coverUrl: book?.coverUrl || '',
				totalPages: book?.totalPages || 0,
				currentPage: book?.currentPage || 0,
				finished: book?.finished || false,
				totalSeconds: stats.totalSeconds,
				sessions: stats.sessions,
			});
		}

		// Sort by totalSeconds descending
		result.sort((a, b) => b.totalSeconds - a.totalSeconds);
		return result;
	}

	getRecentRecords(count: number): ReadingRecord[] {
		return this.records.slice(-count).reverse();
	}

	async deleteBookRecords(title: string): Promise<void> {
		this.records = this.records.filter(r => r.bookTitle !== title);
		await this.saveRecords();
	}

	async deleteRecord(timestamp: number): Promise<void> {
		this.records = this.records.filter(r => r.timestamp !== timestamp);
		await this.saveRecords();
	}

	// ---- Persistence ----

	async loadSessions(): Promise<void> {
		try {
			const data = await this.plugin.loadData();
			if (data) {
				if (data[STORAGE_KEY]) {
					this.records = data[STORAGE_KEY] as ReadingRecord[];
				}
				if (data[BOOKS_KEY]) {
					this.activeBooks = data[BOOKS_KEY] as BookInfo[];
				}
			}
		} catch {
			this.records = [];
			this.activeBooks = [];
		}
	}

	private async saveRecords(): Promise<void> {
		try {
			const data = (await this.plugin.loadData()) || {};
			data[STORAGE_KEY] = this.records;
			await this.plugin.saveData(data);
		} catch {
			// Silently fail
		}
	}

	private async saveBooks(): Promise<void> {
		try {
			const data = (await this.plugin.loadData()) || {};
			data[BOOKS_KEY] = this.activeBooks;
			await this.plugin.saveData(data);
		} catch {
			// Silently fail
		}
	}

	// ---- Lifecycle ----

	setOnTick(callback: (() => void) | null): void {
		this.onTickCallback = callback;
	}

	private stopTimer(): void {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	destroy(): void {
		this.stopTimer();
		this.onTickCallback = null;
	}
}
