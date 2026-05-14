import type { Language } from './i18n';

export interface DashboardSettings {
	dashboardFile: string;
	recentDocCount: number;
	language: Language;
	stylePreset: string;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
	dashboardFile: 'dashboard',
	recentDocCount: 5,
	language: 'en',
	stylePreset: 'earth',
};

export interface BannerData {
	quote: string;
	author: string;
	image: string;
}

export interface QuickLink {
	name: string;
	path: string;
}

export interface ColumnDef {
	name: string;
	color: string;
}

export type CardType = 'task' | 'note' | 'link' | 'project' | 'habit' | 'generic';

export interface TaskItem {
	text: string;
	checked: boolean;
}

export interface DashboardCard {
	id: string;
	title: string;
	type: CardType;
	column: string;
	body: string;
	tasks: TaskItem[];
	url: string;
	wikiLink: string;
	progress: number;
	streak: number;
	dueDate: string;
	blockquote: string;
	color: string;
	coverImage: string;
}

export interface DashboardColumn {
	name: string;
	color: string;
	cards: DashboardCard[];
}

export interface DashboardData {
	banner: BannerData;
	quickLinks: QuickLink[];
	columns: DashboardColumn[];
}

export interface RenderCallbacks {
	onCardEdit(card: DashboardCard): void;
	onCardDelete(cardId: string): void;
	onCheckboxToggle(cardId: string, taskIndex: number, checked: boolean): void;
	onTaskAdd(cardId: string, text: string): void;
	onTaskDelete(cardId: string, taskIndex: number): void;
	onTaskReorder(cardId: string, fromIndex: number, toIndex: number): void;
	onTaskEdit(cardId: string, taskIndex: number, newText: string): void;
	onCardAdd(columnName: string): void;
	onColumnAdd(name: string): void;
	onBannerEdit(): void;
	onQuickLinkAdd(): void;
	onQuickLinkRemove(index: number): void;
	onMoveCard(cardId: string, targetColumn: string, targetIndex: number): void;
	onMemoUpdate(card: DashboardCard, updates: { body: string; blockquote: string }): void;
	onProjectDocsUpdate(card: DashboardCard, docPaths: string[]): void;
	onProjectDocsReorder(cardId: string, fromIndex: number, toIndex: number): void;
	onMemoColorChange(card: DashboardCard, color: string): void;
	onProjectCoverChange(card: DashboardCard, imagePath: string): void;
	onCardTitleEdit(cardId: string, newTitle: string): void;
}
