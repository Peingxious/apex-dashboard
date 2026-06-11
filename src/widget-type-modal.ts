import { App, Modal, setIcon } from 'obsidian';
import { t } from './i18n';

export type WidgetType = 'weather' | 'tracker';

export class WidgetTypeModal extends Modal {
	private onSelect: (type: WidgetType) => void;
	private theme: string;

	constructor(app: App, onSelect: (type: WidgetType) => void, theme?: string) {
		super(app);
		this.onSelect = onSelect;
		this.theme = theme ?? 'earth';
	}

	onOpen(): void {
		const { contentEl, containerEl } = this;
		containerEl.dataset.theme = this.theme;
		contentEl.empty();
		contentEl.addClass('dashboard-modal');

		contentEl.createEl('h2', { text: t('widget.selectType') });

		const list = contentEl.createDiv({ cls: 'dashboard-widget-type-list' });

		const createItem = (type: WidgetType, iconName: string, labelKey: string, descKey: string) => {
			const btn = list.createEl('button', { cls: 'dashboard-widget-type-item' });
			const icon = btn.createSpan({ cls: 'dashboard-widget-type-icon' });
			setIcon(icon, iconName);
			btn.createDiv({ cls: 'dashboard-widget-type-text', text: t(labelKey) });
			btn.createDiv({ cls: 'dashboard-widget-type-desc', text: t(descKey) });
			btn.addEventListener('click', () => {
				this.onSelect(type);
				this.close();
			});
		};

		createItem('weather', 'cloud', 'widget.weatherLabel', 'widget.weatherDesc');
		createItem('tracker', 'bar-chart-4', 'widget.trackerLabel', 'widget.trackerDesc');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
