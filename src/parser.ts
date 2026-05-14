import type {
	BannerData,
	CardType,
DashboardCard,
DashboardColumn,
DashboardData,
	QuickLink,
	TaskItem,
} from './types';

const KNOWN_METADATA_KEYS = new Set(['id', 'link', 'progress', 'due', 'streak', 'type', 'color', 'cover']);

const DEFAULT_BANNER: BannerData = {
	quote: 'The mind is everything. What you think you become.',
	author: 'Buddha',
	image: '',
};

const DEFAULT_COLUMNS = [
	{ name: 'Memo', color: '#f59e0b' },
	{ name: 'Todo', color: '#6366f1' },
	{ name: 'Projects', color: '#10b981' },
	{ name: 'Library', color: '#8b5cf6' },
];

export function parse(markdown: string): DashboardData {
	const { frontmatter, body } = splitFrontmatter(markdown);
	const banner = parseBanner(frontmatter);
	const quickLinks = parseQuickLinks(frontmatter);
	const columnDefs = parseColumnDefs(frontmatter);
	const columns = parseColumns(body, columnDefs);

	return { banner, quickLinks, columns };
}

export function serialize(data: DashboardData): string {
	const lines: string[] = [];

	lines.push('---');
	lines.push('dashboard: true');

	lines.push('banner:');
	lines.push(`  quote: "${escapeYamlString(data.banner.quote)}"`);
	lines.push(`  author: "${escapeYamlString(data.banner.author)}"`);
	if (data.banner.image) {
		lines.push(`  image: "${data.banner.image}"`);
	}

	if (data.quickLinks.length > 0) {
		lines.push('quickLinks:');
		for (const link of data.quickLinks) {
			lines.push(`  - name: "${escapeYamlString(link.name)}"`);
			lines.push(`    path: "${escapeYamlString(link.path)}"`);
		}
	}

	lines.push('columns:');
	for (const col of data.columns) {
		lines.push(`  - name: ${col.name}`);
		lines.push(`    color: "${col.color}"`);
	}

	lines.push('---');
	lines.push('');

	for (const column of data.columns) {
		lines.push(`## ${column.name}`);
		lines.push('');

		for (const card of column.cards) {
			lines.push(`### ${card.title}`);

			if (card.id) {
				lines.push(`id: ${card.id}`);
			}

			if (card.wikiLink) {
				lines.push(`link: [[${card.wikiLink}]]`);
			} else if (card.url) {
				lines.push(`link: ${card.url}`);
			}

			if (card.progress >= 0 && card.type === 'project') {
				lines.push(`progress: ${card.progress}%`);
			}

			if (card.dueDate) {
				lines.push(`due: ${card.dueDate}`);
			}

			if (card.streak > 0 && card.type === 'habit') {
				lines.push(`streak: ${card.streak}`);
			}

			if (card.color) {
				lines.push(`color: ${card.color}`);
			}

			if (card.coverImage) {
				lines.push(`cover: ${card.coverImage}`);
			}

			if (card.blockquote) {
				lines.push(`> ${card.blockquote}`);
			}

			if (card.tasks.length > 0) {
				for (const task of card.tasks) {
					lines.push(`- [${task.checked ? 'x' : ' '}] ${task.text}`);
				}
			}

			const bodyLines = card.body.trim();
			if (bodyLines) {
				if (card.tasks.length > 0 || card.blockquote || card.url || card.wikiLink) {
					lines.push('');
				}
				lines.push(bodyLines);
			}

			lines.push('');
		}
	}

	return lines.join('\n');
}

export function generateDefaultMarkdown(): string {
	const today = new Date();
	const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

	return serialize({
		banner: DEFAULT_BANNER,
		quickLinks: [
			{ name: 'Projects', path: 'projects/index.md' },
			{ name: 'Journal', path: 'journal/index.md' },
		],
		columns: [
			{
				name: 'Memo',
				color: '#f59e0b',
				cards: [
					{
						id: 'demo-memo-1',
						title: `${dateStr} memo`,
						type: 'generic' as CardType,
						column: 'Memo',
						body: 'Welcome to Apex Dashboard! Click here to edit your first memo.',
						tasks: [],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
					},
				],
			},
			{
				name: 'Todo',
				color: '#6366f1',
				cards: [
					{
						id: 'demo-todo-1',
						title: 'Getting Started',
						type: 'task' as CardType,
						column: 'Todo',
						body: '',
						tasks: [
							{ text: 'Try adding a new card', checked: false },
							{ text: 'Drag cards between sections', checked: false },
							{ text: 'Edit the banner quote', checked: false },
							{ text: 'Add a quick link', checked: false },
						],
						url: '',
						wikiLink: '',
						progress: -1,
						streak: 0,
						dueDate: '',
						blockquote: '',
						color: '',
						coverImage: '',
					},
				],
			},
			{
				name: 'Projects',
				color: '#10b981',
				cards: [
					{
						id: 'demo-project-1',
						title: 'My First Project',
						type: 'project' as CardType,
						column: 'Projects',
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
					},
				],
			},
			{
				name: 'Library',
				color: '#8b5cf6',
				cards: [
					{
						id: 'demo-lib-reading',
						title: 'Reading',
						type: 'project' as CardType,
						column: 'Library',
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
					},
					{
						id: 'demo-lib-toread',
						title: 'To Read',
						type: 'project' as CardType,
						column: 'Library',
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
					},
					{
						id: 'demo-lib-done',
						title: 'Done',
						type: 'project' as CardType,
						column: 'Library',
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
					},
				],
			},
		],
	});
}

function splitFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
	const trimmed = markdown.trimStart();
	if (!trimmed.startsWith('---')) {
		return { frontmatter: {}, body: trimmed };
	}

	const end = trimmed.indexOf('---', 3);
	if (end === -1) {
		return { frontmatter: {}, body: trimmed };
	}

	const yaml = trimmed.slice(3, end).trim();
	const body = trimmed.slice(end + 3).trim();

	return { frontmatter: parseSimpleYaml(yaml), body };
}

function parseBanner(fm: Record<string, unknown>): BannerData {
	const raw = fm.banner as Record<string, string> | undefined;
	if (!raw) return { ...DEFAULT_BANNER };

	return {
		quote: raw.quote ?? DEFAULT_BANNER.quote,
		author: raw.author ?? DEFAULT_BANNER.author,
		image: raw.image ?? '',
	};
}

function parseQuickLinks(fm: Record<string, unknown>): QuickLink[] {
	const raw = fm.quickLinks;
	if (!Array.isArray(raw)) return [];

	return raw.map((item: Record<string, string>) => ({
		name: item.name ?? '',
		path: item.path ?? '',
	})).filter(link => link.name && link.path);
}

function parseColumnDefs(fm: Record<string, unknown>): Array<{ name: string; color: string }> {
	const raw = fm.columns;
	if (!Array.isArray(raw)) return DEFAULT_COLUMNS;

	return (raw as Array<Record<string, string>>).map(item => ({
		name: item.name ?? 'Unnamed',
		color: item.color ?? '#6366f1',
	}));
}

function parseColumns(body: string, defs: Array<{ name: string; color: string }>): DashboardColumn[] {
	const sections = splitByH2(body);
	const result: DashboardColumn[] = [];

	for (const def of defs) {
		const section = sections.find(s => s.heading === def.name);
		const cards = section ? parseCards(section.content, def.name) : [];
		result.push({ name: def.name, color: def.color, cards });
	}

	for (const section of sections) {
		if (!defs.some(d => d.name === section.heading)) {
			const cards = parseCards(section.content, section.heading);
			result.push({ name: section.heading, color: '#6366f1', cards });
		}
	}

	return result;
}

function splitByH2(body: string): Array<{ heading: string; content: string }> {
	const lines = body.split('\n');
	const sections: Array<{ heading: string; content: string }> = [];
	let current: { heading: string; lines: string[] } | null = null;

	for (const line of lines) {
		if (line.startsWith('## ')) {
			if (current) {
				sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
			}
			current = { heading: line.slice(3).trim(), lines: [] };
		} else if (current) {
			current.lines.push(line);
		}
	}

	if (current) {
		sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
	}

	return sections;
}

function parseCards(content: string, columnName: string): DashboardCard[] {
	const blocks = splitByH3(content);
	return blocks.map(block => parseCard(block, columnName));
}

function splitByH3(content: string): Array<{ title: string; body: string }> {
	const lines = content.split('\n');
	const blocks: Array<{ title: string; body: string }> = [];
	let current: { title: string; lines: string[] } | null = null;

	for (const line of lines) {
		if (line.startsWith('### ')) {
			if (current) {
				blocks.push({ title: current.title, body: current.lines.join('\n').trim() });
			}
			current = { title: line.slice(4).trim(), lines: [] };
		} else if (current) {
			current.lines.push(line);
		}
	}

	if (current) {
		blocks.push({ title: current.title, body: current.lines.join('\n').trim() });
	}

	return blocks;
}

function parseCard(block: { title: string; body: string }, columnName: string): DashboardCard {
	const { metadata, tasks, blockquote, cleanBody } = extractCardParts(block.body);
	const cardType = detectCardType(tasks, blockquote, metadata);

	return {
		id: metadata.id ?? generateId(block.title, columnName),
		title: block.title,
		type: cardType,
		column: columnName,
		body: cleanBody,
		tasks,
		url: extractUrl(metadata),
		wikiLink: extractWikiLink(metadata),
		progress: extractProgress(metadata),
		streak: extractStreak(metadata),
		dueDate: extractDue(metadata),
		blockquote,
		color: metadata.color ?? '',
		coverImage: metadata.cover ?? '',
	};
}

function extractCardParts(body: string): {
	metadata: Record<string, string>;
	tasks: TaskItem[];
	blockquote: string;
	cleanBody: string;
} {
	const lines = body.split('\n');
	const metadata: Record<string, string> = {};
	const tasks: TaskItem[] = [];
	const bodyLines: string[] = [];
	let blockquote = '';

	for (const line of lines) {
		const trimmed = line.trim();

		const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
		if (kvMatch && kvMatch[1] && kvMatch[2] && KNOWN_METADATA_KEYS.has(kvMatch[1])) {
			metadata[kvMatch[1]] = kvMatch[2];
			continue;
		}

		const taskMatch = trimmed.match(/^- \[([ xX])\]\s*(.+)$/);
		if (taskMatch && taskMatch[1] && taskMatch[2]) {
			tasks.push({ checked: taskMatch[1] !== ' ', text: taskMatch[2] });
			continue;
		}

		if (trimmed.startsWith('> ')) {
			blockquote += (blockquote ? '\n' : '') + trimmed.slice(2);
			continue;
		}

		if (trimmed) {
			bodyLines.push(trimmed);
		}
	}

	return { metadata, tasks, blockquote, cleanBody: bodyLines.join('\n') };
}

function detectCardType(
	tasks: TaskItem[],
	blockquote: string,
	metadata: Record<string, string>,
): CardType {
	const link = metadata.link ?? '';

	if (tasks.length > 0) return 'task';
	if (blockquote) return 'note';
	if (metadata.streak) return 'habit';
	if (link.startsWith('[[')) return 'project';
	if (link.startsWith('http')) return 'link';
	if (metadata.progress) return 'project';
	return 'generic';
}

function extractUrl(metadata: Record<string, string>): string {
	const link = metadata.link ?? '';
	return link.startsWith('http') ? link : '';
}

function extractWikiLink(metadata: Record<string, string>): string {
	const link = metadata.link ?? '';
	const match = link.match(/^\[\[(.+)]]$/);
	return match && match[1] ? match[1] : '';
}

function extractProgress(metadata: Record<string, string>): number {
	if (!metadata.progress) return -1;
	const num = parseInt(metadata.progress.replace('%', ''), 10);
	return isNaN(num) ? -1 : Math.min(100, Math.max(0, num));
}

function extractStreak(metadata: Record<string, string>): number {
	if (!metadata.streak) return 0;
	const num = parseInt(metadata.streak, 10);
	return isNaN(num) ? 0 : num;
}

function extractDue(metadata: Record<string, string>): string {
	return metadata.due ?? '';
}

function generateId(title: string, column: string): string {
	const raw = `${title}::${column}`;
	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw.charCodeAt(i);
		hash = ((hash << 5) - hash) + ch;
		hash |= 0;
	}
	return `card-${Math.abs(hash).toString(36)}`;
}

function escapeYamlString(str: string): string {
	return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = yaml.split('\n');
	let currentKey = '';
	let currentArray: unknown[] | null = null;
	let currentObj: Record<string, string> | null = null;
	let currentMapKey = '';
	let currentMap: Record<string, string> | null = null;
	let arrayIndent = -1;

	for (const line of lines) {
		const indent = line.search(/\S/);
		const trimmed = line.trim();

		if (!trimmed) continue;

		if (indent === 0) {
			// Flush any pending array or map
			if (currentArray !== null && currentKey) {
				if (currentObj) {
					currentArray.push(currentObj);
				}
				result[currentKey] = currentArray;
			}
			if (currentMap !== null && currentMapKey) {
				result[currentMapKey] = currentMap;
			}

			const colonIdx = trimmed.indexOf(':');
			if (colonIdx === -1) continue;

			currentKey = trimmed.slice(0, colonIdx).trim();
			const value = trimmed.slice(colonIdx + 1).trim();

			if (value === '') {
				currentArray = [];
				currentObj = null;
				currentMap = {};
				currentMapKey = currentKey;
				arrayIndent = -1;
			} else {
				result[currentKey] = parseYamlValue(value);
				currentArray = null;
				currentObj = null;
				currentMap = null;
				currentMapKey = '';
				currentKey = '';
			}
		} else if (currentArray !== null && (trimmed.startsWith('- ') || currentObj !== null)) {
			// Array items take priority over map when both are possible.
			// Clear map state so the flush logic won't overwrite the array.
			if (currentMap !== null) {
				currentMap = null;
				currentMapKey = '';
			}
			if (trimmed.startsWith('- name:')) {
				if (currentObj) {
					currentArray.push(currentObj);
				}
				currentObj = {};
				const val = trimmed.slice('- name:'.length).trim();
				currentObj.name = parseYamlStringValue(val);
				arrayIndent = indent;
			} else if (trimmed.startsWith('- ') && arrayIndent === -1) {
				const val = trimmed.slice(2).trim();
				if (currentKey === 'columns') {
					currentObj = { name: parseYamlStringValue(val) };
					arrayIndent = indent;
				} else {
					currentArray.push(parseYamlValue(val));
				}
			} else if (currentObj) {
				const colonIdx = trimmed.indexOf(':');
				if (colonIdx !== -1) {
					const key = trimmed.slice(0, colonIdx).trim();
					const val = trimmed.slice(colonIdx + 1).trim();
					currentObj[key] = parseYamlStringValue(val);
				}
			}
		} else if (currentMap !== null) {
			// Handle map sub-properties (e.g. banner.quote, banner.author)
			const colonIdx = trimmed.indexOf(':');
			if (colonIdx !== -1) {
				const key = trimmed.slice(0, colonIdx).trim();
				const val = trimmed.slice(colonIdx + 1).trim();
				currentMap[key] = parseYamlStringValue(val);
			}
		}
	}

	// Flush any remaining pending structures
	if (currentArray !== null && currentKey) {
		if (currentObj) {
			currentArray.push(currentObj);
		}
		result[currentKey] = currentArray;
	}
	if (currentMap !== null && currentMapKey) {
		result[currentMapKey] = currentMap;
	}

	return result;
}

function parseYamlValue(value: string): unknown {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	if (/^-?\d+$/.test(value)) return parseInt(value, 10);
	if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
	return parseYamlStringValue(value);
}

function parseYamlStringValue(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
	}
	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1);
	}
	return value;
}
