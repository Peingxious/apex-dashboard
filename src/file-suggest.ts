import { App, FuzzySuggestModal, TFile, TFolder } from 'obsidian';

export interface FileSuggestHandle {
	isActive(): boolean;
	close(): void;
}

/**
 * Attach a file search suggest dropdown to an input element.
 * Shows a dropdown with vault files, positioned right below the input.
 *
 * @param onPick  Optional: called immediately when user picks a suggestion item.
 *                If provided, the picked value is NOT written into input —
 *                the caller handles the action (e.g. adding a note).
 *                If omitted, behaviour falls back to filling input (legacy).
 */
export function attachFileSuggest(el: HTMLElement, app: App, onPick?: (value: string) => void): FileSuggestHandle {
	let active = false;
	let selecting = false; // Lock: prevent re-open after user picks an item
	const input = el as HTMLInputElement;
	let modal: FileSuggestModal | null = null;

	input.addEventListener('input', () => {
		if (!input.value.trim()) {
			close();
			return;
		}
		if (selecting) return;
		open();
	});

	input.addEventListener('focus', () => {
		if (selecting) return;
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
		selecting = false;
		modal = new FileSuggestModal(app, (path) => {
			const value = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
			if (onPick) {
				// Caller handles the action directly (e.g. add note)
				onPick(value);
				input.value = '';
				close();
			} else {
				// Legacy: fill input, let caller's Enter handler submit
				selecting = true; // Lock: suppress input→open() re-trigger
				input.value = value;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				close();
				requestAnimationFrame(() => { selecting = false; });
			}
		});
		modal.setOnExternalClose(() => {
			active = false;
			selecting = true; // Block focus from reopening
			requestAnimationFrame(() => { selecting = false; });
		});
		modal.open(input.value);
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
		const bg = modal.containerEl.querySelector('.modal-bg') as HTMLElement;
		if (!container) return;

		const rect = input.getBoundingClientRect();

		// Hide backdrop — inline dropdown, not full-screen modal
		if (bg) {
			bg.style.display = 'none';
		}

		// Hide close button — user closes via Escape/blur/pick, not X
		const closeBtn = container.querySelector('.modal-close-button') as HTMLElement;
		if (closeBtn) {
			closeBtn.style.display = 'none';
		}

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
	private onExternalClose?: () => void;

	constructor(app: App, onSelect: (path: string) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder('Search files...');
	}

	setOnExternalClose(fn: () => void) {
		this.onExternalClose = fn;
	}

	onOpen() {
		super.onOpen();
		positionDropdown();
	}

	override onClose() {
		this.onExternalClose?.();
		super.onClose();
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
