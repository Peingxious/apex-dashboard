import { App, TFile } from 'obsidian';
import { t } from './i18n';

export interface RecentDoc {
	title: string;
	path: string;
	basename: string;
	mtime: number;
}

/**
 * Get recently modified markdown files from the vault.
 */
export function getRecentDocs(app: App, count: number = 10): RecentDoc[] {
	const files = app.vault.getMarkdownFiles();
	const sorted = files
		.filter((f) => !f.path.startsWith('.'))
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, count);

	return sorted.map((file) => ({
		title: file.basename,
		path: file.path,
		basename: file.basename,
		mtime: file.stat.mtime,
	}));
}

/**
 * Render a list of recent documents into a container.
 */
export function renderRecentDocs(
	container: HTMLElement,
	docs: RecentDoc[],
	onClick: (path: string) => void,
): void {
	const list = container.createDiv({ cls: 'dashboard-recent-list' });

	if (docs.length === 0) {
		list.createDiv({
			cls: 'dashboard-recent-empty',
			text: t('recent.empty'),
		});
		return;
	}

	for (const doc of docs) {
		const item = list.createDiv({ cls: 'dashboard-recent-item' });

		const icon = item.createSpan({ cls: 'dashboard-recent-icon' });
		icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;

		const name = item.createSpan({ cls: 'dashboard-recent-name', text: doc.title });

		const date = item.createSpan({
			cls: 'dashboard-recent-date',
			text: formatRelativeTime(doc.mtime),
		});

		item.addEventListener('click', () => onClick(doc.path));
	}
}

function formatRelativeTime(mtime: number): string {
	const now = Date.now();
	const diff = now - mtime;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return t('recent.justNow');
	if (minutes < 60) return t('recent.minutesAgo', { count: minutes });
	if (hours < 24) return t('recent.hoursAgo', { count: hours });
	if (days < 7) return t('recent.daysAgo', { count: days });

	const date = new Date(mtime);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
