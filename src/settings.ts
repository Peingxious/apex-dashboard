import { App, PluginSettingTab, Platform, Setting } from 'obsidian';
import type DashboardPlugin from './main';
import { DEFAULT_SETTINGS, type DashboardSettings, type WidgetTheme } from './types';
import { t, setLanguage, type Language } from './i18n';
import { suggestTrackerKeys } from './tracker-service';
import { geocodeCity } from './weather-service';

export type { DashboardSettings };

export class DashboardSettingTab extends PluginSettingTab {
	plugin: DashboardPlugin;

	constructor(app: App, plugin: DashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.dashboardFile'))
			.setDesc(t('settings.dashboardFileDesc'))
			.addText(text => text
				.setPlaceholder('dashboard or path/to/dashboard')
				.setValue(this.plugin.settings.dashboardFile)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						dashboardFile: value.trim() || DEFAULT_SETTINGS.dashboardFile,
					};
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.languageDesc'))
			.addDropdown(dropdown => dropdown
				.addOptions({
					en: t('settings.languageEn'),
					zh: t('settings.languageZh'),
				})
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					const lang = value as Language;
					this.plugin.settings = {
						...this.plugin.settings,
						language: lang,
					};
					setLanguage(lang);
					await this.plugin.saveSettings();
					this.display();
					this.plugin.refreshAllDashboards();
				}));

		new Setting(containerEl)
			.setName(t('settings.stylePreset'))
			.setDesc(t('settings.stylePresetDesc'))
			.addDropdown(dropdown => dropdown
				.addOptions({
					earth: t('settings.styleEarth'),
					nordic: t('settings.styleNordic'),
					aurora: t('settings.styleAurora'),
					prism: t('settings.stylePrism'),
					island: t('settings.styleIsland'),
					tundra: t('settings.styleTundra'),
					blossom: t('settings.styleBlossom'),
					matcha: t('settings.styleMatcha'),
					lilac: t('settings.styleLilac'),
					haze: t('settings.styleHaze'),
					ember: t('settings.styleEmber'),
					dusk: t('settings.styleDusk'),
					jade: t('settings.styleJade'),
					sakura: t('settings.styleSakura'),
					moonlight: t('settings.styleMoonlight'),
					carbon: t('settings.styleCarbon'),
				})
				.setValue(this.plugin.settings.stylePreset)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						stylePreset: value,
					};
					await this.plugin.saveSettings();
					this.plugin.refreshAllDashboards();
				}));

		new Setting(containerEl)
			.setName(t('settings.recentCount'))
			.setDesc(t('settings.recentCountDesc'))
			.addSlider(slider => slider
				.setLimits(3, 15, 1)
				.setValue(this.plugin.settings.recentDocCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						recentDocCount: value,
					};
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.journalPath'))
			.setDesc(t('settings.journalPathDesc'))
			.addText(text => text
				.setPlaceholder('journal or diary')
				.setValue(this.plugin.settings.journalPath)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						journalPath: value.trim(),
					};
					await this.plugin.saveSettings();
				}));

		// Widget settings - desktop only
		if (!Platform.isMobile) {
			this.renderWidgetSettings(containerEl);
		}

		containerEl.createDiv({ cls: 'dashboard-settings-footer', text: "crafted by Pandora's Digital Garden" });
	}

	private renderWidgetSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: t('settings.widgetTheme'), cls: 'dashboard-settings-section-title' });

		new Setting(containerEl)
			.setName(t('settings.widgetTheme'))
			.setDesc(t('settings.widgetThemeDesc'))
			.addDropdown(dropdown => dropdown
				.addOptions({
					'weather': t('settings.widgetThemeWeather'),
					'weather-heatmap': t('settings.widgetThemeWeatherHeatmap'),
					'off': t('settings.widgetThemeOff'),
				})
				.setValue(this.plugin.settings.widgetTheme)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						widgetTheme: value as WidgetTheme,
					};
					await this.plugin.saveSettings();
					this.plugin.refreshAllDashboards();
					this.display();
				}));

		const theme = this.plugin.settings.widgetTheme;
		const hasWeather = theme !== 'off';
		const hasHeatmap = theme === 'weather-heatmap';

		if (hasWeather) {
			new Setting(containerEl)
				.setName(t('settings.widgetWeatherCity'))
				.setDesc(t('settings.widgetWeatherCityDesc'))
				.addText(text => {
					text
						.setPlaceholder(t('settings.widgetWeatherCityPlaceholder'))
						.setValue(this.plugin.settings.widgetWeatherCity)
						.onChange(async (value) => {
							this.plugin.settings = {
								...this.plugin.settings,
								widgetWeatherCity: value.trim(),
							};
							await this.plugin.saveSettings();
						});
					this.attachCitySuggest(text.inputEl);
				});
		}

		if (hasHeatmap) {
			new Setting(containerEl)
				.setName(t('settings.widgetTrackerKey'))
				.addText(text => text
					.setPlaceholder(t('settings.widgetTrackerKeyPlaceholder'))
					.setValue(this.plugin.settings.widgetTrackerKey)
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							widgetTrackerKey: value.trim(),
						};
						await this.plugin.saveSettings();
					}));

			// Show suggested keys
			const journalPath = this.plugin.settings.journalPath;
			const suggestions = suggestTrackerKeys(this.app, journalPath);
			if (suggestions.length > 0) {
				const sugWrap = containerEl.createDiv({ cls: 'tracker-key-suggestions' });
				sugWrap.createDiv({ cls: 'tracker-key-suggestions-label', text: t('settings.widgetTrackerSuggested') });
				const tagRow = sugWrap.createDiv({ cls: 'tracker-key-tags' });
				for (const k of suggestions.slice(0, 6)) {
					const tag = tagRow.createEl('button', { cls: 'tracker-key-tag', text: k });
					tag.addEventListener('click', async () => {
						this.plugin.settings = {
							...this.plugin.settings,
							widgetTrackerKey: k,
						};
						await this.plugin.saveSettings();
						this.display();
					});
				}
			}

			new Setting(containerEl)
				.setName(t('settings.widgetTrackerDays'))
				.addDropdown(dropdown => dropdown
					.addOptions({
						'30': t('settings.days30'),
						'90': t('settings.days90'),
						'180': t('settings.days180'),
						'365': t('settings.days365'),
					})
					.setValue(String(this.plugin.settings.widgetTrackerDays))
					.onChange(async (value) => {
						this.plugin.settings = {
							...this.plugin.settings,
							widgetTrackerDays: parseInt(value, 10),
						};
						await this.plugin.saveSettings();
					}));

				new Setting(containerEl)
					.setName(t('settings.widgetTrackerSummary'))
					.addDropdown(dropdown => dropdown
						.addOptions({
							'streak': t('settings.summaryStreak'),
							'rate': t('settings.summaryRate'),
							'both': t('settings.summaryBoth'),
							'off': t('settings.summaryOff'),
						})
						.setValue(this.plugin.settings.widgetTrackerSummary ?? 'streak')
						.onChange(async (value) => {
							this.plugin.settings = {
								...this.plugin.settings,
								widgetTrackerSummary: value as 'streak' | 'rate' | 'both' | 'off',
							};
							await this.plugin.saveSettings();
							this.plugin.refreshAllDashboards();
						}));
		}
	}

	private attachCitySuggest(inputEl: HTMLInputElement): void {
		let dropdown: HTMLElement | null = null;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const close = () => {
			if (dropdown) { dropdown.remove(); dropdown = null; }
		};

		inputEl.addEventListener('input', () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			const query = inputEl.value.trim();
			if (query.length < 2) { close(); return; }

			debounceTimer = setTimeout(async () => {
				const results = await geocodeCity(query);
				close();
				if (results.length === 0) return;

				dropdown = inputEl.ownerDocument.createElement('div');
				dropdown.className = 'dashboard-city-suggest';
				Object.assign(dropdown.style, {
					position: 'absolute',
					zIndex: '100',
					background: 'var(--background-secondary)',
					border: '1px solid var(--background-modifier-border)',
					borderRadius: '6px',
					boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
					maxHeight: '200px',
					overflowY: 'auto',
					width: inputEl.getBoundingClientRect().width + 'px',
				});

				const rect = inputEl.getBoundingClientRect();
				dropdown.style.left = rect.left + 'px';
				dropdown.style.top = (rect.bottom + 4) + 'px';

				for (const r of results) {
					const item = dropdown.createDiv({ cls: 'dashboard-city-suggest-item' });
					const label = r.admin1 ? `${r.name}, ${r.admin1}, ${r.country}` : `${r.name}, ${r.country}`;
					item.textContent = label;
					Object.assign(item.style, {
						padding: '6px 10px',
						cursor: 'pointer',
						fontSize: '0.85em',
						borderBottom: '1px solid var(--background-modifier-border)',
					});
					item.addEventListener('mouseenter', () => {
						item.style.background = 'var(--background-modifier-hover)';
					});
					item.addEventListener('mouseleave', () => {
						item.style.background = '';
					});
					item.addEventListener('click', async () => {
						inputEl.value = r.name;
						this.plugin.settings = {
							...this.plugin.settings,
							widgetWeatherCity: r.name,
							widgetWeatherLat: r.latitude,
							widgetWeatherLon: r.longitude,
						};
						await this.plugin.saveSettings();
						close();
						this.plugin.refreshAllDashboards();
					});
				}

				inputEl.ownerDocument.body.appendChild(dropdown);
			}, 300);
		});

		inputEl.addEventListener('blur', () => {
			setTimeout(close, 200);
		});
	}
}
