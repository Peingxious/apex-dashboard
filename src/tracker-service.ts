import { App, TFile } from 'obsidian';
import type { TrackerDataPoint } from './types';

export function readTrackerData(
	app: App,
	journalPath: string,
	key: string,
	days: number,
): TrackerDataPoint[] {
	const points: TrackerDataPoint[] = [];
	const now = new Date();

	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		const dateStr = formatDateString(d);
		const filePath = journalPath ? `${journalPath}/${dateStr}.md` : `${dateStr}.md`;

		const file = app.vault.getFileByPath(filePath);
		if (!file) {
			points.push({ date: dateStr, value: null });
			continue;
		}

		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm || !(key in fm)) {
			points.push({ date: dateStr, value: null });
			continue;
		}

		const raw = fm[key];
		const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
		points.push({ date: dateStr, value: isNaN(num) ? null : num });
	}

	return points;
}

export function suggestTrackerKeys(app: App, journalPath?: string): string[] {
	const keys = new Set<string>();

	let files = app.vault.getMarkdownFiles();

	if (journalPath) {
		files = files.filter(f => f.path.startsWith(journalPath + '/'));
	}

	files = files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 20);

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (fm) {
			for (const k of Object.keys(fm)) {
				if (typeof fm[k] === 'number' || !isNaN(parseFloat(String(fm[k])))) {
					keys.add(k);
				}
			}
		}
	}

	return [...keys].sort();
}

function formatDateString(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}
