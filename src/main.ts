import { Plugin, moment, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { DashboardSettings, DEFAULT_SETTINGS } from './types';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './view';
import { DashboardSettingTab } from './settings';
import { SidebarView, SIDEBAR_VIEW_TYPE } from './sidebar-view';
import { NoteDashboardView, NOTE_DASHBOARD_VIEW_TYPE } from './note-dashboard-view';
import { setLanguage, t, type Language } from './i18n';
import { parse } from './parser';

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

		// Register the shared sidebar view
		this.registerView(
			SIDEBAR_VIEW_TYPE,
			(leaf) => new SidebarView(leaf, this)
		);

		// Register the note-level dashboard view (any note with dashboard: true frontmatter)
		this.registerView(
			NOTE_DASHBOARD_VIEW_TYPE,
			(leaf) => new NoteDashboardView(leaf, this)
		);

		// Auto-detect dashboard notes on file open
		this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
			if (!leaf) return;
			const file = leaf.getViewState();
			// Only intercept markdown views
			if (file.type !== 'markdown' || !file.state?.file) return;

			const notePath = file.state.file as string;
			const tfile = this.app.vault.getAbstractFileByPath(notePath);
			if (!(tfile instanceof TFile)) return;

			// Check if this note has dashboard: true frontmatter
			const isDashboardNote = await this.isDashboardNote(notePath);
			if (isDashboardNote && leaf.getViewType() !== NOTE_DASHBOARD_VIEW_TYPE) {
				// Open in note dashboard view instead
				await this.openNoteAsDashboard(notePath);
			}
		}));

		// Add settings tab
		this.addSettingTab(new DashboardSettingTab(this.app, this));

		// Ribbon icon to open dashboard
		this.addRibbonIcon('home', 'Open Dashboard', () => {
			this.activateView();
		});

		// Command to open dashboard (with hotkey: Ctrl+Alt+Shift+Z)
		this.addCommand({
			id: 'open-dashboard',
			name: t('command.openDashboard'),
			hotkey: {
				modifiers: ['Mod', 'Alt', 'Shift'],
				key: 'Z',
			},
			callback: () => {
				this.activateView();
			},
		});

		// Command: Toggle the shared dashboard sidebar
		this.addCommand({
			id: 'toggle-dashboard-sidebar',
			name: t('command.toggleSidebar'),
			callback: () => {
				this.toggleSidebar();
			},
		});

		// Command: Convert current note headings to dashboard columns (no page open)
		this.addCommand({
			id: 'convert-note-to-dashboard',
			name: t('command.convertToDashboard'),
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.convertNoteToDashboard(activeFile.path);
					}
					return true;
				}
				return false;
			},
		});

		// Command: Restore note from dashboard view (remove dashboard frontmatter)
		this.addCommand({
			id: 'restore-note-from-dashboard',
			name: t('command.restoreFromDashboard'),
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.restoreNoteFromDashboard(activeFile.path);
					}
					return true;
				}
				return false;
			},
		});

		// Command: Embed current note into dashboard workspace
		this.addCommand({
			id: 'embed-note-in-dashboard',
			name: t('command.embedInDashboard'),
			hotkey: {
				modifiers: ['Mod', 'Alt'],
				key: 'D',
			},
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === 'md') {
					if (!checking) {
						this.embedNoteInDashboard(activeFile.path);
					}
					return true;
				}
				return false;
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

	/** Open or reveal the shared dashboard sidebar (right side) */
	async activateSidebar(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
		if (!leaf) {
			// Open in right sidebar
			leaf = workspace.getLeaf('tab', 'right');
			await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	/** Toggle the shared dashboard sidebar on/off */
	async toggleSidebar(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
		if (existing) {
			await workspace.closeLeaf(existing);
		} else {
			await this.activateSidebar();
		}
	}

	/**
	 * Open a floating dashboard overlay on the current note.
	 * Renders kanban columns at the top of the active markdown view
	 * without modifying the original file.
	 * @param notePath - The path of the note to overlay kanban on
	 */
	async openDashboardOverlay(notePath: string): Promise<void> {
		const { workspace } = this.app;
		// Find or create an overlay leaf (using the right sidebar as container)
		let leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab', 'right');
			await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);

		// Notify the sidebar view to show overlay mode for this note
		const view = leaf.view as SidebarView;
		view.showOverlayForNote(notePath);
	}

	/**
	 * Scan the current note for ## headings, extract them as columns,
	 * write them to the file's frontmatter, and open in dashboard overlay.
	 */
	async convertNoteToDashboard(notePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
			new Notice('Only markdown files can be converted to dashboard');
			return;
		}

		const content = await this.app.vault.read(file);
		const noteName = file.basename;
		const headings = this.extractH2Headings(content, noteName);

		if (headings.length === 0) {
			new Notice(t('sidebar.noHeadings'));
			return;
		}

		// Build the new frontmatter with columns
		const newFrontmatter = this.buildColumnFrontmatter(headings);
		const newContent = this.injectFrontmatter(content, newFrontmatter);

		// Write back to file
		await this.app.vault.modify(file, newContent);

		new Notice(t('sidebar.converted', { count: headings.length }));
		this.refreshAllDashboards();
	}

	/**
	 * Extract all ## headings from markdown content.
	 * Skips the file's self-reference heading (e.g., ## [[文件名]] or ## 文件名).
	 */
	private extractH2Headings(content: string, noteName: string): string[] {
		const headings: string[] = [];
		const lines = content.split('\n');
		const selfRefPatterns = [
			`# [[${noteName}]]`,
			`# [[${noteName}|`,
			noteName,
		];

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('## ')) {
				const heading = trimmed.slice(3).trim();
				// Skip self-reference heading (file name self-embed)
				const isSelfRef = selfRefPatterns.some(
					(p) => heading === p || heading.startsWith(p)
				);
				if (!isSelfRef) {
					headings.push(heading);
				}
			}
		}
		return headings;
	}

	/**
	 * Build YAML frontmatter string for columns.
	 */
	private buildColumnFrontmatter(headings: string[]): string {
		const lines: string[] = [];
		lines.push('---');
		lines.push('columns:');
		for (const heading of headings) {
			// Escape quotes in heading names
			const escaped = heading.replace(/"/g, '\\"');
			lines.push(`  - name: "${escaped}"`);
			lines.push('    type: project');
		}
		lines.push('---');
		return lines.join('\n');
	}

	/**
	 * Inject or replace frontmatter in markdown content.
	 */
	private injectFrontmatter(content: string, frontmatter: string): string {
		const trimmed = content.trim();

		// Check if frontmatter already exists
		if (trimmed.startsWith('---')) {
			const endIdx = trimmed.indexOf('---', 3);
			if (endIdx !== -1) {
				// Replace existing frontmatter
				const body = trimmed.slice(endIdx + 3).trim();
				return frontmatter + '\n\n' + body;
			}
		}

		// Prepend new frontmatter
		return frontmatter + '\n\n' + trimmed;
	}

	/**
	 * Remove dashboard frontmatter from note and restore as plain note.
	 */
	async restoreNoteFromDashboard(notePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
			new Notice(t('sidebar.noFrontmatter'));
			return;
		}

		const content = await this.app.vault.read(file);

		// Check if has frontmatter
		const trimmed = content.trim();
		if (!trimmed.startsWith('---')) {
			new Notice(t('sidebar.noFrontmatter'));
			return;
		}

		const endIdx = trimmed.indexOf('---', 3);
		if (endIdx === -1) {
			new Notice(t('sidebar.noFrontmatter'));
			return;
		}

		const frontmatterBlock = trimmed.slice(0, endIdx + 3);
		const body = trimmed.slice(endIdx + 3).trim();

		// Check if it's a dashboard frontmatter
		if (!frontmatterBlock.includes('dashboard:') && !frontmatterBlock.includes('columns:')) {
			new Notice(t('sidebar.noFrontmatter'));
			return;
		}

		// Remove the frontmatter
		await this.app.vault.modify(file, body);

		new Notice(t('sidebar.restored'));
		this.refreshAllDashboards();

		// Exit overlay mode if active
		const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as SidebarView;
			if (view) {
				(view as any).exitOverlayMode?.();
			}
		}

		// Close note dashboard views for this file
		const ndLeaves = this.app.workspace.getLeavesOfType(NOTE_DASHBOARD_VIEW_TYPE);
		for (const leaf of ndLeaves) {
			const view = leaf.view as NoteDashboardView;
			const state = leaf.getViewState() as { state?: { notePath?: string } };
			if (state?.state?.notePath === notePath) {
				await this.app.workspace.closeLeaf(leaf);
			}
		}
	}

	/**
	 * Check if a markdown file has dashboard: true frontmatter.
	 */
	async isDashboardNote(notePath: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile) || !file.path.endsWith('.md')) return false;

		try {
			const content = await this.app.vault.read(file);
			const trimmed = content.trimStart();
			if (!trimmed.startsWith('---')) return false;

			const endIdx = trimmed.indexOf('---', 3);
			if (endIdx === -1) return false;

			const yaml = trimmed.slice(3, endIdx);
			return yaml.includes('dashboard:') && yaml.includes('true');
		} catch {
			return false;
		}
	}

	/**
	 * Open a note as a full-page Dashboard view.
	 * Creates or reuses a NoteDashboardView leaf and loads the note data.
	 */
	async openNoteAsDashboard(notePath: string): Promise<void> {
		const { workspace } = this.app;

		// Check if already open in a note-dashboard view
		const existingLeaves = workspace.getLeavesOfType(NOTE_DASHBOARD_VIEW_TYPE);
		for (const leaf of existingLeaves) {
			const state = leaf.getViewState() as { state?: { notePath?: string } };
			if (state?.state?.notePath === notePath) {
				workspace.revealLeaf(leaf);
				return;
			}
		}

		// Create new leaf with the note dashboard view
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({
			type: NOTE_DASHBOARD_VIEW_TYPE,
			active: true,
			state: { notePath },
		});
		workspace.revealLeaf(leaf);

		// Initialize the view with the note path
		const view = leaf.view as NoteDashboardView;
		if (view.setNotePath) {
			await view.setNotePath(notePath);
		}
	}

	/**
	 * Embed a note's dashboard into the main workspace dashboard view.
	 */
	async embedNoteInDashboard(notePath: string): Promise<void> {
		const { workspace } = this.app;

		// Find or create the main dashboard view
		let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);

		// Embed the note into the dashboard
		const view = leaf.view as DashboardView;
		await view.embedNoteDashboard(notePath);
	}

	/**
	 * Convert a note's headings to dashboard columns, then open it as
	 * a full-page dashboard (instead of just sidebar overlay).
	 */
	async convertNoteToDashboardPage(notePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile) || !file.path.endsWith('.md')) {
			new Notice(t('noteDash.onlyMarkdown'));
			return;
		}

		const content = await this.app.vault.read(file);
		const noteName = file.basename;
		const headings = this.extractH2Headings(content, noteName);

		if (headings.length === 0) {
			new Notice(t('sidebar.noHeadings'));
			return;
		}

		// Build the new frontmatter with columns
		const newFrontmatter = this.buildColumnFrontmatter(headings);
		const newContent = this.injectFrontmatter(content, newFrontmatter);

		// Write back to file
		await this.app.vault.modify(file, newContent);

		new Notice(t('sidebar.converted', { count: headings.length }));

		// Open as full-page dashboard (not sidebar overlay)
		await this.openNoteAsDashboard(notePath);
	}
}
