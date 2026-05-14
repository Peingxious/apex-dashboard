import { App, Modal, TFile, setIcon } from 'obsidian';
import type { QuickLink } from './types';
import { t } from './i18n';

export function renderQuickLinks(
	container: HTMLElement,
	links: QuickLink[],
	onClick: (path: string) => void,
	onRemove: (index: number) => void,
	onAdd: () => void,
): void {
	const section = container.createDiv({ cls: 'dashboard-section dashboard-quick-links' });
	section.createEl('h3', { text: t('quickLinks.title'), cls: 'dashboard-section-title' });

	if (links.length === 0) {
		section.createSpan({ text: t('quickLinks.empty'), cls: 'dashboard-empty' });
	} else {
		const list = section.createDiv({ cls: 'dashboard-ql-list' });
		links.forEach((link, index) => {
			const item = list.createDiv({ cls: 'dashboard-ql-item' });

			const label = item.createSpan({ text: link.name, cls: 'dashboard-ql-name' });

			const removeBtn = item.createEl('button', {
				cls: 'dashboard-ql-remove',
				attr: { 'aria-label': t('common.remove', { name: link.name }) },
			});
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				onRemove(index);
			});

			item.addEventListener('click', () => onClick(link.path));
			item.setAttribute('role', 'button');
			item.setAttribute('aria-label', t('common.open', { name: link.name }));
		});
	}

	const addBtn = section.createEl('button', {
		cls: 'dashboard-ql-add',
		text: t('quickLinks.addLink'),
		attr: { 'aria-label': t('quickLinks.addQuickLink') },
	});
	addBtn.addEventListener('click', onAdd);
}

export class DocSearchModal extends Modal {
	private onSelect: (link: QuickLink) => void;

	constructor(app: App, onSelect: (link: QuickLink) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('dashboard-modal');
		contentEl.createEl('h2', { text: t('quickLinks.addDocLink') });

		const searchWrap = contentEl.createDiv({ cls: 'dashboard-docsearch' });

		const input = searchWrap.createEl('input', {
			cls: 'dashboard-modal-input dashboard-docsearch-input',
			attr: { type: 'text', placeholder: t('quickLinks.searchDocs'), autofocus: 'true' },
		});

		const resultsList = searchWrap.createDiv({ cls: 'dashboard-docsearch-results' });

		const renderResults = (query: string) => {
			resultsList.empty();
			const q = query.toLowerCase().trim();
			if (!q) {
				resultsList.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickLinks.typeToSearch') });
				return;
			}

			const files = this.app.vault.getMarkdownFiles();
			const matches = files
				.filter(f => !f.path.startsWith('.'))
				.filter(f => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
				.slice(0, 20);

			if (matches.length === 0) {
				resultsList.createDiv({ cls: 'dashboard-docsearch-hint', text: t('quickLinks.noDocsFound') });
				return;
			}

			for (const file of matches) {
				const item = resultsList.createDiv({ cls: 'dashboard-docsearch-item' });
				item.createEl('span', { cls: 'dashboard-docsearch-icon', text: '📄' });
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

		renderResults('');

		const cancelBtn = contentEl.createEl('button', {
			cls: 'dashboard-docsearch-cancel',
			text: t('common.cancel'),
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
