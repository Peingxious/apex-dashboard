import { App, Modal, Setting } from 'obsidian';
import type { WeatherConfig } from './types';
import { geocodeCity, type GeocodeResult } from './weather-service';
import { t } from './i18n';

export class WeatherConfigModal extends Modal {
	private onSave: (title: string, config: WeatherConfig) => void;
	private theme: string;

	private titleValue = '';
	private cityQuery = '';
	private searching = false;
	private results: GeocodeResult[] = [];

	private latitude: number | null = null;
	private longitude: number | null = null;
	private cityName = '';

	constructor(app: App, onSave: (title: string, config: WeatherConfig) => void, theme?: string) {
		super(app);
		this.onSave = onSave;
		this.theme = theme ?? 'earth';
		this.titleValue = t('widget.weatherLabel');
	}

	onOpen(): void {
		const { contentEl, containerEl } = this;
		containerEl.dataset.theme = this.theme;
		contentEl.empty();
		contentEl.addClass('dashboard-modal');

		contentEl.createEl('h2', { text: t('weather.configTitle') });

		new Setting(contentEl)
			.setName(t('chart.titleLabel'))
			.addText((text) => {
				text.setValue(this.titleValue);
				text.onChange((v) => { this.titleValue = v.trim(); });
			});

		const citySetting = new Setting(contentEl)
			.setName(t('weather.cityLabel'))
			.setDesc(t('weather.cityPlaceholder'))
			.addText((text) => {
				text.setPlaceholder(t('weather.cityPlaceholder'));
				text.onChange(async (v) => {
					this.cityQuery = v.trim();
					await this.searchCities();
					this.renderCityResults(resultsWrap);
				});
			});

		const resultsWrap = contentEl.createDiv({ cls: 'dashboard-weather-city-results' });
		this.renderCityResults(resultsWrap);

		const manual = contentEl.createDiv({ cls: 'dashboard-weather-manual' });
		manual.createDiv({ cls: 'dashboard-weather-manual-title', text: t('weather.manualCoords') });

		const latSetting = new Setting(manual).setName(t('weather.latLabel')).addText((text) => {
			text.inputEl.type = 'number';
			text.setValue(this.latitude === null ? '' : String(this.latitude));
			text.onChange((v) => {
				const num = parseFloat(v);
				this.latitude = Number.isFinite(num) ? num : null;
			});
		});
		latSetting.settingEl.addClass('dashboard-weather-lat');

		const lonSetting = new Setting(manual).setName(t('weather.lonLabel')).addText((text) => {
			text.inputEl.type = 'number';
			text.setValue(this.longitude === null ? '' : String(this.longitude));
			text.onChange((v) => {
				const num = parseFloat(v);
				this.longitude = Number.isFinite(num) ? num : null;
			});
		});
		lonSetting.settingEl.addClass('dashboard-weather-lon');

		const actions = contentEl.createDiv({ cls: 'dashboard-modal-actions' });
		const saveBtn = actions.createEl('button', { cls: 'mod-cta', text: t('common.save') });
		const cancelBtn = actions.createEl('button', { text: t('common.cancel') });

		const updateSaveState = () => {
			saveBtn.toggleAttribute('disabled', this.latitude === null || this.longitude === null || !this.cityName.trim());
		};
		updateSaveState();

		saveBtn.addEventListener('click', () => {
			if (this.latitude === null || this.longitude === null) return;
			const title = this.titleValue || t('widget.weatherLabel');
			this.onSave(title, { latitude: this.latitude, longitude: this.longitude, cityName: this.cityName || title });
			this.close();
		});
		cancelBtn.addEventListener('click', () => this.close());

		citySetting.controlEl.addEventListener('click', () => updateSaveState());
		manual.addEventListener('input', () => updateSaveState());
		resultsWrap.addEventListener('click', () => updateSaveState());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async searchCities(): Promise<void> {
		const q = this.cityQuery.trim();
		if (!q) {
			this.results = [];
			return;
		}
		this.searching = true;
		try {
			this.results = await geocodeCity(q);
		} finally {
			this.searching = false;
		}
	}

	private renderCityResults(container: HTMLElement): void {
		container.empty();

		if (this.searching) {
			container.createDiv({ cls: 'dashboard-weather-city-status', text: t('weather.searching') });
			return;
		}

		if (!this.cityQuery.trim()) return;
		if (this.results.length === 0) {
			container.createDiv({ cls: 'dashboard-weather-city-status', text: t('weather.notFound') });
			return;
		}

		for (const r of this.results) {
			const labelParts = [r.name, r.admin1, r.country].filter(Boolean);
			const btn = container.createEl('button', {
				cls: 'dashboard-weather-city-item',
				text: labelParts.join(', '),
			});
			btn.addEventListener('click', () => {
				this.latitude = r.latitude;
				this.longitude = r.longitude;
				this.cityName = r.name;
				container.empty();
				container.createDiv({ cls: 'dashboard-weather-city-picked', text: labelParts.join(', ') });
			});
		}
	}
}
