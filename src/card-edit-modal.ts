import { Modal, App, Setting } from "obsidian";
import type { DashboardCard } from "./types";
import { t } from "./i18n";

function stripBulletPrefix(text: string): string {
	return text.split('\n').map(line => {
		if (line.startsWith('- ')) return line.slice(2);
		if (line.startsWith('> - ')) return '> ' + line.slice(4);
		return line;
	}).join('\n');
}

function addBulletPrefix(text: string): string {
	return text.split('\n').map(line => {
		if (!line.trim()) return line;
		if (line.startsWith('> ')) return '> - ' + line.slice(2);
		return '- ' + line;
	}).join('\n');
}

export class CardEditModal extends Modal {
	private card: DashboardCard;
	private onSave: (updates: Partial<DashboardCard>) => void;
	private localTitle: string;
	private localBody: string;

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
		this.localBody = stripBulletPrefix(card.body);
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
		const savedBody = addBulletPrefix(this.localBody);
		if (savedBody !== this.card.body) {
			updates.body = savedBody;
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
