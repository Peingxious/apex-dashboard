import { App, Modal, setIcon } from 'obsidian';
import type { QuickAction } from './types';
import { PRESET_ACTIONS } from './types';
import { t } from './i18n';

export function renderQuickActions(
	container: HTMLElement,
	actions: QuickAction[],
	onExecute: (action: QuickAction) => void,
	onRemove: (index: number) => void,
	onAdd: () => void,
	onTogglePin?: () => { pinned: boolean },
): void {
	const section = container.createDiv({ cls: 'dashboard-section dashboard-quick-actions' });

	const header = section.createDiv({ cls: 'dashboard-qa-header' });
	header.createEl('h3', { text: t('quickActions.title'), cls: 'dashboard-section-title' });

	const btnGroup = header.createDiv({ cls: 'dashboard-qa-btn-group' });

	// Pin button (left of add button)
	if (onTogglePin) {
		const pinBtn = btnGroup.createEl('button', {
			cls: 'dashboard-qa-pin-btn',
			attr: { 'aria-label': 'Toggle pin' },
		});
		const updatePinIcon = () => {
			const state = onTogglePin();
			setIcon(pinBtn, state.pinned ? 'pin' : 'pin-off');
			pinBtn.toggleClass('dashboard-qa-pin-btn--active', state.pinned);
		};
		updatePinIcon();
		pinBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			onTogglePin();
			updatePinIcon();
		});
	}

	const addBtn = btnGroup.createEl('button', {
		cls: 'dashboard-qa-add-btn',
		attr: { 'aria-label': t('quickActions.addAction') },
	});
	setIcon(addBtn, 'plus');
	addBtn.addEventListener('click', onAdd);

	const list = section.createDiv({ cls: 'dashboard-qa-list' });

	// Preset actions (no remove button)
	for (const preset of PRESET_ACTIONS) {
		const item = list.createDiv({ cls: 'dashboard-qa-item dashboard-qa-item--preset' });
		const iconEl = item.createSpan({ cls: 'dashboard-qa-icon' });
		setIcon(iconEl, preset.icon);
		item.createSpan({ text: preset.name, cls: 'dashboard-qa-name' });
		item.addEventListener('click', () => onExecute(preset));
		item.setAttribute('role', 'button');
	}

	// Custom actions (with remove button)
	if (actions.length === 0 && PRESET_ACTIONS.length === 0) {
		section.createSpan({ text: t('quickActions.empty'), cls: 'dashboard-empty' });
	}

	actions.forEach((action, index) => {
		const item = list.createDiv({ cls: 'dashboard-qa-item' });

		const iconEl = item.createSpan({ cls: 'dashboard-qa-icon' });
		setIcon(iconEl, action.icon);

		item.createSpan({ text: action.name, cls: 'dashboard-qa-name' });

		if (action.type === 'command') {
			item.createSpan({ cls: 'dashboard-qa-badge', text: 'CMD' });
		}

		const removeBtn = item.createEl('button', {
			cls: 'dashboard-qa-remove',
			attr: { 'aria-label': t('common.remove', { name: action.name }) },
		});
		setIcon(removeBtn, 'x');
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			onRemove(index);
		});

		item.addEventListener('click', () => onExecute(action));
		item.setAttribute('role', 'button');
	});

}

export class AddActionModal extends Modal {
	private onSelect: (action: QuickAction) => void;
	private activeTab: 'file' | 'command' = 'file';

	constructor(app: App, onSelect: (action: QuickAction) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('dashboard-modal');
		contentEl.createEl('h2', { text: t('quickActions.addAction') });

		const tabBar = contentEl.createDiv({ cls: 'dashboard-action-tabs' });
		const fileTab = tabBar.createEl('button', {
			cls: 'dashboard-action-tab active',
			text: t('quickActions.fileTab'),
		});
		const cmdTab = tabBar.createEl('button', {
			cls: 'dashboard-action-tab',
			text: t('quickActions.commandTab'),
		});

		const searchWrap = contentEl.createDiv({ cls: 'dashboard-docsearch' });

		const switchTab = (tab: 'file' | 'command') => {
			this.activeTab = tab;
			fileTab.toggleClass('active', tab === 'file');
			cmdTab.toggleClass('active', tab === 'command');
			input.value = '';
			renderResults('');
		};

		fileTab.addEventListener('click', () => switchTab('file'));
		cmdTab.addEventListener('click', () => switchTab('command'));

		const input = searchWrap.createEl('input', {
			cls: 'dashboard-modal-input dashboard-docsearch-input',
			attr: { type: 'text', placeholder: t('quickActions.searchPlaceholder'), autofocus: 'true' },
		});

		const resultsList = searchWrap.createDiv({ cls: 'dashboard-docsearch-results' });

		const renderResults = (query: string) => {
			resultsList.empty();
			const q = query.toLowerCase().trim();
			if (this.activeTab === 'file') {
				this.renderFileResults(resultsList, q);
			} else {
				this.renderCommandResults(resultsList, q);
			}
		};

		input.addEventListener('input', () => renderResults(input.value));
		renderResults('');

		const cancelBtn = contentEl.createEl('button', {
			cls: 'dashboard-docsearch-cancel',
			text: t('common.cancel'),
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	private renderFileResults(container: HTMLElement, q: string): void {
		if (!q) {
			container.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickActions.typeToSearchFile') });
			return;
		}

		const files = this.app.vault.getFiles()
			.filter(f => !f.path.startsWith('.'))
			.filter(f => f.extension === 'md' || f.extension === 'pdf' || f.extension === 'canvas' || f.extension === 'base' || /\.(png|jpg|jpeg|gif|svg|webp|bmp|mp3|mp4|m4a|m4b|mov|mkv|avi)$/i.test(f.path))
			.filter(f => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
			.slice(0, 20);

		if (files.length === 0) {
			container.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickActions.noResults') });
			return;
		}

		for (const file of files) {
			const item = container.createDiv({ cls: 'dashboard-docsearch-item' });
			item.createEl('span', { cls: 'dashboard-docsearch-icon', text: '\u{1F4C4}' });
			const info = item.createDiv({ cls: 'dashboard-docsearch-info' });
			info.createEl('div', { cls: 'dashboard-docsearch-name', text: file.basename });
			info.createEl('div', { cls: 'dashboard-docsearch-path', text: file.path });

			item.addEventListener('click', () => {
				this.onSelect({ name: file.basename, icon: 'file-text', type: 'file', target: file.path });
				this.close();
			});
		}
	}

	private renderCommandResults(container: HTMLElement, q: string): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const commands = (this.app as any).commands.commands as Record<string, { name?: string }>;

		if (!commands) {
			container.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickActions.noResults') });
			return;
		}

		const entries = Object.entries(commands)
			.map(([id, cmd]) => ({ id, name: cmd.name ?? id }))
			.filter(entry => {
				if (!q) return true;
				return entry.name.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q);
			})
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 30);

		if (!q) {
			container.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickActions.typeToSearchCmd') });
			return;
		}

		if (entries.length === 0) {
			container.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickActions.noResults') });
			return;
		}

		for (const entry of entries) {
			const item = container.createDiv({ cls: 'dashboard-docsearch-item' });
			item.createEl('span', { cls: 'dashboard-docsearch-icon', text: '⚙️' });
			const info = item.createDiv({ cls: 'dashboard-docsearch-info' });
			info.createEl('div', { cls: 'dashboard-docsearch-name', text: entry.name });
			info.createEl('div', { cls: 'dashboard-docsearch-path', text: entry.id });

			item.addEventListener('click', () => {
				this.onSelect({ name: entry.name, icon: 'terminal', type: 'command', target: entry.id });
				this.close();
			});
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Kept for project search modal reuse
export class DocSearchModal extends Modal {
	private onSelect: (link: { name: string; path: string }) => void;

	constructor(app: App, onSelect: (link: { name: string; path: string }) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('dashboard-modal');
		contentEl.createEl('h2', { text: t('quickActions.fileTab') });

		const searchWrap = contentEl.createDiv({ cls: 'dashboard-docsearch' });
		const input = searchWrap.createEl('input', {
			cls: 'dashboard-modal-input dashboard-docsearch-input',
			attr: { type: 'text', placeholder: t('quickActions.searchPlaceholder'), autofocus: 'true' },
		});
		const resultsList = searchWrap.createDiv({ cls: 'dashboard-docsearch-results' });

		const renderResults = (query: string) => {
			resultsList.empty();
			const q = query.toLowerCase().trim();
			if (!q) return;

			const files = this.app.vault.getFiles()
				.filter(f => !f.path.startsWith('.'))
				.filter(f => f.extension === 'md' || f.extension === 'pdf' || f.extension === 'canvas' || f.extension === 'base' || /\.(png|jpg|jpeg|gif|svg|webp|bmp|mp3|mp4|m4a|m4b|mov|mkv|avi)$/i.test(f.path))
				.filter(f => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
				.slice(0, 20);

			for (const file of files) {
				const item = resultsList.createDiv({ cls: 'dashboard-docsearch-item' });
				item.createEl('span', { cls: 'dashboard-docsearch-icon', text: '\u{1F4C4}' });
				const info = item.createDiv({ cls: 'dashboard-docsearch-info' });
				info.createEl('div', { cls: 'dashboard-docsearch-name', text: file.basename });
				info.createEl('div', { cls: 'dashboard-docsearch-path', text: file.path });
				item.addEventListener('click', () => {
					this.onSelect({ name: file.basename, path: file.path });
					this.close();
				});
			}
		};

		input.addEventListener('input', () => renderResults(input.value));
		input.focus();

		contentEl.createEl('button', {
			cls: 'dashboard-docsearch-cancel',
			text: t('common.cancel'),
		}).addEventListener('click', () => this.close());
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
