import { App, Modal, setIcon, Vault } from 'obsidian';
import type { BannerData } from './types';
import { t } from './i18n';

export function renderBanner(
	container: HTMLElement,
	banner: BannerData,
	onEdit: () => void,
	app: App,
): void {
	const el = container.createDiv({ cls: 'dashboard-banner' });

	if (banner.image) {
		const resolved = resolveVaultImage(app, banner.image);
		if (resolved) {
			el.style.backgroundImage = `url("${resolved}")`;
		}
	}

	const overlay = el.createDiv({ cls: 'dashboard-banner-overlay' });
	const content = overlay.createDiv({ cls: 'dashboard-banner-content' });

	const quoteDecor = content.createDiv({ cls: 'dashboard-banner-quote-decor' });
	quoteDecor.setText('“');

	const quoteText = content.createEl('p', {
		cls: 'dashboard-banner-quote',
		text: banner.quote,
	});

	const authorText = content.createEl('cite', {
		cls: 'dashboard-banner-author',
		text: banner.author,
	});

	const editBtn = overlay.createEl('button', {
		cls: 'dashboard-banner-edit-btn',
		attr: { 'aria-label': t('banner.editLabel') },
	});
	setIcon(editBtn, 'wand');
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onEdit();
	});
}

export function resolveVaultImage(app: App, relativePath: string): string | null {
	const file = app.vault.getFileByPath(relativePath);
	if (!file) return null;

	const adapter = app.vault.adapter;
	if ('getResourcePath' in adapter && typeof (adapter as { getResourcePath: (path: string) => string }).getResourcePath === 'function') {
		return (adapter as { getResourcePath: (path: string) => string }).getResourcePath(relativePath);
	}

	const parts = relativePath.split('/');
	const encoded = parts.map(p => encodeURIComponent(p)).join('/');
	return `app://local/${encoded}`;
}

export class BannerEditModal extends Modal {
	private banner: BannerData;
	private onSave: (updates: Partial<BannerData>) => void;
	private theme: string;

	constructor(app: App, banner: BannerData, onSave: (updates: Partial<BannerData>) => void, theme?: string) {
		super(app);
		this.banner = banner;
		this.onSave = onSave;
		this.theme = theme ?? 'earth';
	}

	onOpen(): void {
		const { contentEl, containerEl } = this;
		containerEl.dataset.theme = this.theme;
		contentEl.addClass('dashboard-modal');
		contentEl.createEl('h2', { text: t('banner.editTitle') });

		const form = contentEl.createDiv({ cls: 'dashboard-modal-form' });

		const quoteField = form.createDiv();
		quoteField.createEl('label', { text: t('banner.quote') });
		const quoteInput = quoteField.createEl('textarea', {
			cls: 'dashboard-modal-input',
			attr: { rows: '3' },
		});
		quoteInput.value = this.banner.quote;

		const authorField = form.createDiv();
		authorField.createEl('label', { text: t('banner.author') });
		const authorInput = authorField.createEl('input', {
			cls: 'dashboard-modal-input',
			attr: { type: 'text' },
		});
		authorInput.value = this.banner.author;

		const imageField = form.createDiv();
		imageField.createEl('label', { text: t('banner.imagePath') });
		const imageInput = imageField.createEl('input', {
			cls: 'dashboard-modal-input',
			attr: { type: 'text', placeholder: 'attachments/banner.jpg' },
		});
		imageInput.value = this.banner.image;

		const actions = form.createDiv({ cls: 'dashboard-modal-actions' });

		const saveBtn = actions.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => {
			this.onSave({
				quote: quoteInput.value,
				author: authorInput.value,
				image: imageInput.value,
			});
			this.close();
		});

		const cancelBtn = actions.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
