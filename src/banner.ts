import { App, Modal, Setting } from 'obsidian';
import type { BannerData, QuoteItem } from './types';
import { t } from './i18n';

/**
 * Resolve a vault-relative image path to a usable resource URL.
 */
export function resolveVaultImage(app: App, path: string): string | null {
	if (!path) return null;
	try {
		const file = app.vault.getAbstractFileByPath(path);
		if (file) {
			return app.vault.getResourcePath(file);
		}
	} catch {
		// ignore
	}
	return null;
}

/**
 * Render the dashboard banner into the given container.
 * Returns the banner element for further customization.
 */
export function renderBanner(
	container: HTMLElement,
	banner: BannerData,
	onEdit: () => void,
	app: App,
): HTMLElement {
	const bannerEl = container.createDiv({ cls: 'dashboard-banner' });

	// Background image
	if (banner.image) {
		const resolved = resolveVaultImage(app, banner.image);
		if (resolved) {
			bannerEl.style.backgroundImage = `url("${resolved}")`;
		}
	}

	// Overlay
	const overlay = bannerEl.createDiv({ cls: 'dashboard-banner-overlay' });

	// Edit button
	const editBtn = overlay.createEl('button', {
		cls: 'dashboard-banner-edit-btn',
		attr: { 'aria-label': t('banner.edit') },
	});
	editBtn.setText(t('banner.edit'));
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onEdit();
	});

	// Quote section
	const quoteColor = banner.quoteColor || '#ffffff';
	const quoteEl = overlay.createDiv({
		cls: 'dashboard-banner-quote',
		attr: { style: `color: ${quoteColor}` },
	});
	quoteEl.setText(banner.quote || '');

	const authorEl = overlay.createDiv({
		cls: 'dashboard-banner-author',
		attr: { style: `color: ${quoteColor}` },
	});
	authorEl.setText(banner.author || '');

	return bannerEl;
}

/**
 * Modal for editing banner settings (quote, author, images, etc.)
 */
export class BannerEditModal extends Modal {
	private banner: BannerData;
	private onSave: (updates: Partial<BannerData>) => void;
	private localQuotes: QuoteItem[];
	private localImages: string[];

	constructor(
		app: App,
		banner: BannerData,
		onSave: (updates: Partial<BannerData>) => void,
		_stylePreset?: string,
	) {
		super(app);
		this.banner = { ...banner };
		this.onSave = onSave;
		this.localQuotes = banner.quotes ? [...banner.quotes] : [];
		this.localImages = banner.images ? [...banner.images] : [];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dashboard-banner-edit-modal');

		contentEl.createEl('h2', { text: t('banner.editTitle') });

		// Main quote
		new Setting(contentEl)
			.setName(t('banner.quote'))
			.addTextArea((text) => {
				text.setValue(this.banner.quote || '')
					.setPlaceholder(t('banner.quotePlaceholder'))
					.onChange((val) => (this.banner.quote = val));
			});

		// Main author
		new Setting(contentEl)
			.setName(t('banner.author'))
			.addText((text) => {
				text.setValue(this.banner.author || '')
					.setPlaceholder(t('banner.authorPlaceholder'))
					.onChange((val) => (this.banner.author = val));
			});

		// Quote color
		new Setting(contentEl)
			.setName(t('banner.quoteColor'))
			.addText((text) => {
				text.setValue(this.banner.quoteColor || '#ffffff')
					.onChange((val) => (this.banner.quoteColor = val));
			});

		// Main image
		new Setting(contentEl)
			.setName(t('banner.image'))
			.setDesc(t('banner.imageDesc'))
			.addText((text) => {
				text.setValue(this.banner.image || '')
					.setPlaceholder(t('banner.imagePlaceholder'))
					.onChange((val) => (this.banner.image = val));
			});

		// Rotation quotes
		contentEl.createEl('h3', { text: t('banner.rotationQuotes') });
		const quotesContainer = contentEl.createDiv({ cls: 'dashboard-banner-quotes-list' });
		this.renderQuotesList(quotesContainer);

		const addQuoteBtn = contentEl.createEl('button', {
			cls: 'dashboard-banner-add-btn',
			text: t('banner.addQuote'),
		});
		addQuoteBtn.addEventListener('click', () => {
			this.localQuotes.push({ quote: '', author: '' });
			this.renderQuotesList(quotesContainer);
		});

		// Rotation images
		contentEl.createEl('h3', { text: t('banner.rotationImages') });
		const imagesContainer = contentEl.createDiv({ cls: 'dashboard-banner-images-list' });
		this.renderImagesList(imagesContainer);

		const addImageBtn = contentEl.createEl('button', {
			cls: 'dashboard-banner-add-btn',
			text: t('banner.addImage'),
		});
		addImageBtn.addEventListener('click', () => {
			this.localImages.push('');
			this.renderImagesList(imagesContainer);
		});

		// Save button
		const saveBtn = contentEl.createEl('button', {
			cls: 'dashboard-banner-save-btn',
			text: t('banner.save'),
		});
		saveBtn.addEventListener('click', () => {
			const updates: Partial<BannerData> = {
				quote: this.banner.quote,
				author: this.banner.author,
				image: this.banner.image,
				quoteColor: this.banner.quoteColor,
				quotes: this.localQuotes.length > 0 ? this.localQuotes : undefined,
				images: this.localImages.length > 0 ? this.localImages : undefined,
			};
			this.onSave(updates);
			this.close();
		});
	}

	private renderQuotesList(container: HTMLElement): void {
		container.empty();
		this.localQuotes.forEach((item, index) => {
			const row = container.createDiv({ cls: 'dashboard-banner-quote-row' });

			row.createEl('input', {
				cls: 'dashboard-banner-quote-input',
				attr: { type: 'text', placeholder: t('banner.quotePlaceholder') },
			}).value = item.quote;
			(row.querySelector('input') as HTMLInputElement)?.addEventListener('input', (e) => {
				this.localQuotes[index]!.quote = (e.target as HTMLInputElement).value;
			});

			row.createEl('input', {
				cls: 'dashboard-banner-author-input',
				attr: { type: 'text', placeholder: t('banner.authorPlaceholder') },
			}).value = item.author;
			(row.querySelectorAll('input')[1] as HTMLInputElement)?.addEventListener('input', (e) => {
				this.localQuotes[index]!.author = (e.target as HTMLInputElement).value;
			});

			const delBtn = row.createEl('button', {
				cls: 'dashboard-banner-remove-btn',
				text: '×',
			});
			delBtn.addEventListener('click', () => {
				this.localQuotes.splice(index, 1);
				this.renderQuotesList(container);
			});
		});
	}

	private renderImagesList(container: HTMLElement): void {
		container.empty();
		this.localImages.forEach((img, index) => {
			const row = container.createDiv({ cls: 'dashboard-banner-image-row' });

			row.createEl('input', {
				cls: 'dashboard-banner-image-input',
				attr: { type: 'text', placeholder: t('banner.imagePlaceholder') },
			}).value = img;
			(row.querySelector('input') as HTMLInputElement)?.addEventListener('input', (e) => {
				this.localImages[index] = (e.target as HTMLInputElement).value;
			});

			const delBtn = row.createEl('button', {
				cls: 'dashboard-banner-remove-btn',
				text: '×',
			});
			delBtn.addEventListener('click', () => {
				this.localImages.splice(index, 1);
				this.renderImagesList(container);
			});
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
