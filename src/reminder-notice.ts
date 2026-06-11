import { App, Modal } from 'obsidian';
import { t } from './i18n';

export class ReminderNoticeModal extends Modal {
	private taskText: string;
	private onDismiss: () => void;
	private onSnooze: () => void;

	constructor(app: App, taskText: string, onDismiss: () => void, onSnooze: () => void) {
		super(app);
		this.taskText = taskText;
		this.onDismiss = onDismiss;
		this.onSnooze = onSnooze;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dashboard-reminder-modal');

		contentEl.createEl('h2', { text: t('reminder.dueNotice', { task: this.taskText }) });

		const actions = contentEl.createDiv({ cls: 'dashboard-modal-actions' });
		const dismissBtn = actions.createEl('button', { cls: 'mod-cta', text: t('reminder.dismiss') });
		const snoozeBtn = actions.createEl('button', { text: t('reminder.snooze') });

		dismissBtn.addEventListener('click', () => {
			this.onDismiss();
			this.close();
		});

		snoozeBtn.addEventListener('click', () => {
			this.onSnooze();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
