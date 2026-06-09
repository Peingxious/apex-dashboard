import { Modal, App, Setting, Notice } from "obsidian";
import type { DashboardCard } from "./types";
import { t } from "./i18n";

export class CardEditModal extends Modal {
	private card: DashboardCard;
	private onSave: (updates: Partial<DashboardCard>) => void;
	private localTitle: string;
	private localBody: string;
	private localDueDate: string;
	private localColor: string;
	private localProgress: number;
	private localWikiLink: string;
	private localUrl: string;

	constructor(
		app: App,
		card: DashboardCard,
		onSave: (updates: Partial<DashboardCard>) => void,
		_stylePreset?: string,
	) {
		super(app);
		this.card = card;
		this.onSave = onSave;
		this.localTitle = card.title;
		this.localBody = card.body;
		this.localDueDate = card.dueDate ?? '';
		this.localColor = card.color ?? '';
		this.localProgress = card.progress;
		this.localWikiLink = card.wikiLink ?? '';
		this.localUrl = card.url ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dashboard-card-edit-modal');

		contentEl.createEl('h2', { text: t('renderer.editCard') });

		// Title
		new Setting(contentEl)
			.setName(t('renderer.cardTitle'))
			.addText(text => text
				.setValue(this.localTitle)
				.onChange(value => this.localTitle = value));

		// Wiki Link
		new Setting(contentEl)
			.setName(t('renderer.wikiLink'))
			.setDesc(t('renderer.wikiLinkDesc'))
			.addText(text => text
				.setValue(this.localWikiLink)
				.setPlaceholder('[[note]] or note')
				.onChange(value => this.localWikiLink = value));

		// URL
		new Setting(contentEl)
			.setName(t('renderer.url'))
			.setDesc(t('renderer.urlDesc'))
			.addText(text => text
				.setValue(this.localUrl)
				.setPlaceholder('https://...')
				.onChange(value => this.localUrl = value));

		// Due date
		new Setting(contentEl)
			.setName(t('renderer.dueDate'))
			.addText(text => text
				.setValue(this.localDueDate)
				.setPlaceholder('YYYY-MM-DD')
				.onChange(value => this.localDueDate = value));

		// Progress (for project cards)
		if (this.card.type === 'project') {
			new Setting(contentEl)
				.setName(t('renderer.progress'))
				.addSlider(slider => slider
					.setLimits(0, 100, 5)
					.setValue(this.localProgress >= 0 ? this.localProgress : 0)
					.setDynamicTooltip()
					.onChange(value => this.localProgress = value));
		}

		// Color
		new Setting(contentEl)
			.setName(t('renderer.color'))
			.addColorPicker(picker => picker
				.setValue(this.localColor || '#6366f1')
				.onChange(value => this.localColor = value));

		// Body (text area)
		const bodySetting = new Setting(contentEl)
			.setName(t('renderer.body'))
			.setClass('dashboard-card-edit-body');
		bodySetting.controlEl.empty();
		const textarea = bodySetting.controlEl.createEl('textarea', {
			cls: 'dashboard-card-edit-textarea',
			attr: { rows: '6' },
		});
		textarea.value = this.localBody;
		textarea.addEventListener('input', () => {
			this.localBody = textarea.value;
		});

		// Save button
		const buttonContainer = contentEl.createDiv({ cls: 'dashboard-modal-actions' });
		const saveBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: t('common.save'),
		});
		saveBtn.addEventListener('click', () => {
			this.save();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: t('common.cancel'),
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	private save(): void {
		const updates: Partial<DashboardCard> = {};

		if (this.localTitle.trim() && this.localTitle !== this.card.title) {
			updates.title = this.localTitle.trim();
		}
		if (this.localBody !== this.card.body) {
			updates.body = this.localBody;
		}
		if (this.localDueDate !== (this.card.dueDate ?? '')) {
			updates.dueDate = this.localDueDate;
		}
		if (this.localColor !== (this.card.color ?? '')) {
			updates.color = this.localColor;
		}
		if (this.localProgress !== this.card.progress && this.card.type === 'project') {
			updates.progress = this.localProgress;
		}
		if (this.localWikiLink !== (this.card.wikiLink ?? '')) {
			updates.wikiLink = this.localWikiLink;
		}
		if (this.localUrl !== (this.card.url ?? '')) {
			updates.url = this.localUrl;
		}

		if (Object.keys(updates).length > 0) {
			this.onSave(updates);
		}
		this.close();
	}

	onClose(): void {
		// Cleanup
	}
}
