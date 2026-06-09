import { App, FuzzySuggestModal, TFile, TFolder } from 'obsidian';

export interface FileSuggestHandle {
	isActive(): boolean;
	close(): void;
}

/**
 * Attach a file search suggest dropdown to an input element.
 * Shows a dropdown with vault files, positioned right below the input.
 */
export function attachFileSuggest(el: HTMLElement, app: App): FileSuggestHandle {
	let active = false;
	const input = el as HTMLInputElement;
	let modal: FileSuggestModal | null = null;

	input.addEventListener('input', () => {
		if (!input.value.trim()) {
			close();
			return;
		}
		open();
	});

	input.addEventListener('focus', () => {
		if (input.value.trim()) open();
	});

	input.addEventListener('blur', () => {
		// Delay close so click on suggestion item can register
		setTimeout(() => { if (active) close(); }, 150);
	});

	input.addEventListener('keydown', (e) => {
		if (!modal || !active) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			modal.selectNext();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			modal.selectPrev();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
			input.blur();
		}
	});

	function open() {
		close();
		active = true;
		modal = new FileSuggestModal(app, (path) => {
			input.value = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			close();
			input.focus();
		});
		modal.open(input.value);
		positionDropdown();
	}

	function close() {
		if (modal) {
			modal.close();
			modal = null;
		}
		active = false;
	}

	function positionDropdown() {
		if (!modal) return;
		const container = modal.containerEl.querySelector('.modal-container') as HTMLElement;
		if (!container) return;

		const rect = input.getBoundingClientRect();
		container.style.position = 'fixed';
		container.style.top = `${rect.bottom + 4}px`;
		container.style.left = `${rect.left}px`;
		container.style.width = `${Math.max(rect.width, 280)}px`;
		container.style.maxHeight = '260px';
		container.style.zIndex = '10000';
	}

	return {
		isActive: () => active,
		close,
	};
}

class FileSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (path: string) => void;
	private queryValue: string = '';

	constructor(app: App, onSelect: (path: string) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder('Search files...');
	}

	open(query?: string) {
		this.queryValue = query ?? '';
		super.open();
		// Auto-focus and set initial value
		setTimeout(() => {
			const inp = this.inputEl?.querySelector('input');
			if (inp && this.queryValue) {
				inp.value = this.queryValue;
				inp.dispatchEvent(new Event('input'));
			}
		}, 50);
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onSelect(item.path);
	}

	selectNext() {
		const results = this.resultContainerEl.querySelectorAll('.suggestion-item');
		const current = this.resultContainerEl.querySelector('.is-selected');
		const idx = current ? [...results].indexOf(current as HTMLElement) : -1;
		const nextIdx = Math.min(idx + 1, results.length - 1);
		results[nextIdx]?.classList.add('is-selected');
		current?.classList.remove('is-selected');
		(results[nextIdx] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
	}

	selectPrev() {
		const results = this.resultContainerEl.querySelectorAll('.suggestion-item');
		const current = this.resultContainerEl.querySelector('.is-selected');
		const idx = current ? [...results].indexOf(current as HTMLElement) : 0;
		const prevIdx = Math.max(idx - 1, 0);
		results[prevIdx]?.classList.add('is-selected');
		current?.classList.remove('is-selected');
		(results[prevIdx] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
	}
}

/**
 * A file picker modal (centered dialog) for selecting files to add to Project cards.
 * Shows "文件" header, search input, file list, and cancel button.
 */
export class FilePickerModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder(t('filePicker.search'));
	}

	onOpen(): void {
		super.onOpen();
		const { contentEl } = this;
		contentEl.addClass('dashboard-file-picker');
		// Override title
		const titleEl = this.containerEl.querySelector('.modal-title') as HTMLElement;
		if (titleEl) titleEl.setText(t('filePicker.title'));
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onSelect(item);
	}
}

function t(key: string): string {
	// Simple i18n fallback for file picker strings
	const map: Record<string, string> = {
		'filePicker.title': '文件',
		'filePicker.search': '搜索...',
	};
	return map[key] ?? key;
}
