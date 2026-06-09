import { Plugin, moment } from 'obsidian';
import { DashboardSettings, DEFAULT_SETTINGS } from './types';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './view';
import { DashboardSettingTab } from './settings';
import { setLanguage, type Language } from './i18n';

export default class DashboardPlugin extends Plugin {
	settings: DashboardSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Auto-detect system language on first run
		const savedData = await this.loadData();
		if (!savedData || savedData.language === undefined) {
			const systemLang = this.detectSystemLanguage();
			this.settings.language = systemLang;
			await this.saveSettings();
		}

		// Apply language setting
		setLanguage(this.settings.language);

		// Register the dashboard view
		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) => new DashboardView(leaf, this)
		);

		// Add settings tab
		this.addSettingTab(new DashboardSettingTab(this.app, this));

		// Ribbon icon to open dashboard
		this.addRibbonIcon('home', 'Open Dashboard', () => {
			this.activateView();
		});

		// Command to open dashboard
		this.addCommand({
			id: 'open-dashboard',
			name: 'Open Dashboard',
			callback: () => {
				this.activateView();
			},
		});
	}

	onunload(): void {
		// Cleanup handled by Obsidian
	}

	/**
	 * Detect system language from Obsidian's locale or browser/OS language.
	 * Returns 'zh' for Chinese, 'en' for everything else.
	 */
	private detectSystemLanguage(): Language {
		// 1. Check Obsidian's translation language (most reliable)
		const obsidianLocale = moment.locale();
		if (obsidianLocale && obsidianLocale.startsWith('zh')) {
			return 'zh';
		}

		// 2. Check browser/Electron navigator.language
		if (typeof navigator !== 'undefined' && navigator.language) {
			if (navigator.language.startsWith('zh')) {
				return 'zh';
			}
		}

		// 3. Default to English
		return 'en';
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshAllDashboards(): void {
		this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE).forEach((leaf) => {
			const view = leaf.view as DashboardView;
			view.refresh();
		});
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
