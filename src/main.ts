import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type DashboardSettings } from './types';
import { DashboardSettingTab } from './settings';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './view';
import { setLanguage, t } from './i18n';

export default class DashboardPlugin extends Plugin {
	settings!: DashboardSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));

		this.addRibbonIcon('home', t('main.openDashboard'), () => this.openDashboard());

		this.addCommand({
			id: 'open-dashboard',
			name: t('main.openDashboard'),
			callback: () => this.openDashboard(),
		});

		this.addSettingTab(new DashboardSettingTab(this.app, this));
	}

	onunload(): void {
		// registerView cleanup is automatic
	}

	private async openDashboard(): Promise<void> {
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
	}

	async loadSettings(): Promise<void> {
		this.settings = {
			...DEFAULT_SETTINGS,
			...await this.loadData() as Partial<DashboardSettings>,
		};
		setLanguage(this.settings.language);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshAllDashboards(): void {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		for (const leaf of leaves) {
			if (leaf.view instanceof DashboardView) {
				leaf.view.refresh();
			}
		}
	}
}
