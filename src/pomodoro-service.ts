import type DashboardPlugin from './main';

// Activity color palette
const ACTIVITY_COLORS = [
	'#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
	'#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
	'#84cc16', '#0ea5e9', '#a855f7', '#d946ef', '#fb923c',
];

const activityColorMap: Record<string, string> = {};
let colorIndex = 0;

export function activityColor(name: string): string {
	if (!activityColorMap[name]) {
		activityColorMap[name] = ACTIVITY_COLORS[colorIndex % ACTIVITY_COLORS.length]!;
		colorIndex++;
	}
	return activityColorMap[name]!;
}

export interface PomodoroState {
	status: 'idle' | 'running' | 'paused';
	remainingSeconds: number;
	totalSeconds: number;
	completedWorkSessions: number;
	sessionType: 'work' | 'shortBreak' | 'longBreak';
}

export interface PomodoroRecord {
	activity: string;
	timestamp: number;
	duration: number; // minutes
}

const STORAGE_KEY = 'peingxious-dashboard-pomodoro-records';

export class PomodoroService {
	private plugin: DashboardPlugin;
	private state: PomodoroState;
	private timerInterval: ReturnType<typeof setInterval> | null = null;
	private onTickCallback: (() => void) | null = null;
	private onCompleteCallback: (() => void) | null = null;
	private records: PomodoroRecord[] = [];
	private currentActivity: string = 'Focus';
	private completedWorkSessionsInCycle: number = 0;

	constructor(plugin: DashboardPlugin) {
		this.plugin = plugin;
		this.state = {
			status: 'idle',
			remainingSeconds: plugin.settings.pomodoroWorkMinutes * 60,
			totalSeconds: plugin.settings.pomodoroWorkMinutes * 60,
			completedWorkSessions: 0,
			sessionType: 'work',
		};
	}

	getState(): PomodoroState {
		return { ...this.state };
	}

	getTodayCount(): number {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStart = today.getTime();
		return this.records.filter(r => r.timestamp >= todayStart).length;
	}

	getActivity(): string {
		return this.currentActivity;
	}

	setActivity(name: string): void {
		this.currentActivity = name;
	}

	start(): void {
		if (this.state.status === 'running') return;

		this.state.status = 'running';

		this.timerInterval = setInterval(() => {
			if (this.state.remainingSeconds <= 0) {
				this.completeSession();
				return;
			}
			this.state.remainingSeconds--;
			this.onTickCallback?.();
		}, 1000);
	}

	reset(): void {
		this.stopTimer();
		const settings = this.plugin.settings;

		if (this.state.sessionType === 'work') {
			// Reset to work session
			this.state = {
				status: 'idle',
				remainingSeconds: settings.pomodoroWorkMinutes * 60,
				totalSeconds: settings.pomodoroWorkMinutes * 60,
				completedWorkSessions: this.state.completedWorkSessions,
				sessionType: 'work',
			};
		} else {
			// Reset to break
			const isLongBreak = this.state.sessionType === 'longBreak';
			const breakMinutes = isLongBreak ? settings.pomodoroLongBreakMinutes : settings.pomodoroShortBreakMinutes;
			this.state = {
				status: 'idle',
				remainingSeconds: breakMinutes * 60,
				totalSeconds: breakMinutes * 60,
				completedWorkSessions: this.state.completedWorkSessions,
				sessionType: this.state.sessionType,
			};
		}
	}

	private completeSession(): void {
		this.stopTimer();

		if (this.state.sessionType === 'work') {
			// Record completed work session
			const record: PomodoroRecord = {
				activity: this.currentActivity,
				timestamp: Date.now(),
				duration: this.plugin.settings.pomodoroWorkMinutes,
			};
			this.records.push(record);
			this.saveRecords();

			this.completedWorkSessionsInCycle++;
			this.state.completedWorkSessions++;

			// Determine next session type
			const settings = this.plugin.settings;
			const isLongBreak = this.completedWorkSessionsInCycle >= settings.pomodoroLongBreakInterval;

			if (isLongBreak) {
				this.completedWorkSessionsInCycle = 0;
				this.state = {
					status: 'idle',
					remainingSeconds: settings.pomodoroLongBreakMinutes * 60,
					totalSeconds: settings.pomodoroLongBreakMinutes * 60,
					completedWorkSessions: this.state.completedWorkSessions,
					sessionType: 'longBreak',
				};
			} else {
				this.state = {
					status: 'idle',
					remainingSeconds: settings.pomodoroShortBreakMinutes * 60,
					totalSeconds: settings.pomodoroShortBreakMinutes * 60,
					completedWorkSessions: this.state.completedWorkSessions,
					sessionType: 'shortBreak',
				};
			}

			// Auto-start break if enabled
			if (settings.pomodoroAutoStartBreak) {
				this.start();
			}
		} else {
			// Break completed, go back to work
			const settings = this.plugin.settings;
			this.state = {
				status: 'idle',
				remainingSeconds: settings.pomodoroWorkMinutes * 60,
				totalSeconds: settings.pomodoroWorkMinutes * 60,
				completedWorkSessions: this.state.completedWorkSessions,
				sessionType: 'work',
			};
		}

		this.onCompleteCallback?.();
	}

	private stopTimer(): void {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	setOnTick(callback: (() => void) | null): void {
		this.onTickCallback = callback;
	}

	setOnComplete(callback: (() => void) | null): void {
		this.onCompleteCallback = callback;
	}

	async loadSessions(): Promise<void> {
		try {
			const data = await this.plugin.loadData();
			if (data?.[STORAGE_KEY]) {
				this.records = data[STORAGE_KEY] as PomodoroRecord[];
			}
		} catch {
			this.records = [];
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

	destroy(): void {
		this.stopTimer();
		this.onTickCallback = null;
		this.onCompleteCallback = null;
	}

	getTotalFocusMinutes(): number {
		return this.records.reduce((sum, r) => sum + r.duration, 0);
	}

	getTodayFocusMinutes(): number {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStart = today.getTime();
		return this.records
			.filter(r => r.timestamp >= todayStart)
			.reduce((sum, r) => sum + r.duration, 0);
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

		// Check consecutive days from today
		const now = new Date();
		const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

		let streak = 0;
		let checkDate = new Date(now);
		checkDate.setHours(0, 0, 0, 0);

		// Check if today has records
		if (sortedDays[0] === today) {
			streak = 1;
			checkDate.setDate(checkDate.getDate() - 1);
		} else {
			// Check if yesterday has records (today might not have ended yet)
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

	getRecentActivities(count: number): string[] {
		const activitySet = new Set<string>();
		// Get unique activities from most recent records
		for (let i = this.records.length - 1; i >= 0 && activitySet.size < count; i--) {
			activitySet.add(this.records[i]!.activity);
		}
		return [...activitySet];
	}

	getActivityBreakdownByRange(days: number): Map<string, number> {
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		const breakdown = new Map<string, number>();
		for (const r of this.records) {
			if (r.timestamp >= cutoff) {
				breakdown.set(r.activity, (breakdown.get(r.activity) || 0) + r.duration);
			}
		}
		return breakdown;
	}

	getRecentRecords(count: number): PomodoroRecord[] {
		return this.records.slice(-count).reverse();
	}
}
