import { Modal, App, Setting } from "obsidian";
import type { DashboardSettings } from './types';
import { t } from './i18n';

export class CountdownSettingsModal extends Modal {
	private settings: DashboardSettings;
	private onSave: (updates: Partial<DashboardSettings>) => void;
	private localSettings: DashboardSettings;

	constructor(
		app: App,
		settings: DashboardSettings,
		onSave: (updates: Partial<DashboardSettings>) => void,
	) {
		super(app);
		this.settings = settings;
		this.onSave = onSave;
		this.localSettings = { ...settings };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dashboard-countdown-settings-modal');

		// Title
		contentEl.createEl('h2', { text: t('countdown.settingsTitle') });

		// Target date
		const dateStr = this.localSettings.countdownTargetDate;
		const hasTime = dateStr.includes('T');
		const datePart = hasTime ? dateStr.split('T')[0]! : dateStr;
		const timePart = hasTime ? dateStr.split('T')[1]!.substring(0, 5) : '00:00';

		new Setting(contentEl)
			.setName(t('countdown.targetDate'))
			.setDesc(t('countdown.targetDate'))
			.addText(text => text
				.setValue(datePart)
				.setPlaceholder('YYYY-MM-DD')
				.onChange(value => {
					const time = this.localSettings.countdownTargetDate.includes('T')
						? this.localSettings.countdownTargetDate.split('T')[1]!.substring(0, 5)
						: '00:00';
					this.localSettings.countdownTargetDate = value ? `${value}T${time}` : '';
				}));

		new Setting(contentEl)
			.setName(t('countdown.targetTime'))
			.setDesc(t('countdown.targetTime'))
			.addText(text => text
				.setValue(timePart)
				.setPlaceholder('HH:MM')
				.onChange(value => {
					const date = this.localSettings.countdownTargetDate.includes('T')
						? this.localSettings.countdownTargetDate.split('T')[0]!
						: this.localSettings.countdownTargetDate || new Date().toISOString().split('T')[0]!;
					this.localSettings.countdownTargetDate = `${date}T${value || '00:00'}`;
				}));

		// Display mode
		new Setting(contentEl)
			.setName(t('countdown.displayMode'))
			.addDropdown(dropdown => dropdown
				.addOption('days', t('countdown.days'))
				.addOption('hours', t('countdown.hours'))
				.addOption('minutes', t('countdown.minutes'))
				.setValue(this.localSettings.countdownDisplayMode)
				.onChange(value => {
					this.localSettings.countdownDisplayMode = value as 'days' | 'hours' | 'minutes';
				}));

		// Reminder days
		new Setting(contentEl)
			.setName(t('countdown.reminderDays'))
			.setDesc(t('countdown.reminderDaysDesc'))
			.addText(text => {
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.setValue(String(this.localSettings.countdownReminderDays))
					.onChange(value => {
						const num = parseInt(value, 10);
						this.localSettings.countdownReminderDays = isNaN(num) ? 0 : Math.max(0, num);
					});
				return text;
			});

		// Label
		new Setting(contentEl)
			.setName(t('countdown.label'))
			.setDesc(t('countdown.labelPlaceholder'))
			.addText(text => text
				.setValue(this.localSettings.countdownLabel)
				.setPlaceholder(t('countdown.labelPlaceholder'))
				.onChange(value => {
					this.localSettings.countdownLabel = value;
				}));

		// Save button
		const buttonContainer = contentEl.createDiv({ cls: 'dashboard-countdown-settings-buttons' });

		const saveBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Save',
		});
		saveBtn.addEventListener('click', () => {
			this.onSave({
				countdownTargetDate: this.localSettings.countdownTargetDate,
				countdownDisplayMode: this.localSettings.countdownDisplayMode,
				countdownReminderDays: this.localSettings.countdownReminderDays,
				countdownLabel: this.localSettings.countdownLabel,
			});
			this.close();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
