import { App, setIcon } from 'obsidian';
import type { DashboardData, DashboardColumn, DashboardCard, RenderCallbacks } from './types';
import { t } from './i18n';
import { resolveVaultImage } from './banner';

export function renderDashboard(
	container: HTMLElement,
	data: DashboardData,
	callbacks: RenderCallbacks,
	app: App,
): void {
	container.empty();
	container.addClass('dashboard-kanban');

	for (const column of data.columns) {
		const section = renderSection(column, callbacks, app);
		container.appendChild(section);
	}

	const addColBtn = container.createDiv({ cls: 'dashboard-add-section' });
	addColBtn.setText(t('renderer.addSection'));
	addColBtn.setAttribute('role', 'button');
	addColBtn.addEventListener('click', () => {
		addColBtn.empty();
		const input = addColBtn.createEl('input', {
			cls: 'dashboard-task-input',
			attr: { type: 'text', placeholder: t('renderer.sectionName') },
		});
		input.focus();

		const finish = () => {
			const name = input.value.trim();
			input.value = '';
			if (name) {
				callbacks.onColumnAdd(name);
			} else {
				addColBtn.empty();
				addColBtn.setText(t('renderer.addSection'));
			}
		};

		input.addEventListener('keydown', (ke) => {
			if (ke.key === 'Enter') {
				ke.preventDefault();
				finish();
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				input.value = '';
				addColBtn.empty();
				addColBtn.setText(t('renderer.addSection'));
			}
		});
		input.addEventListener('blur', () => {
			const name = input.value.trim();
			if (name) {
				callbacks.onColumnAdd(name);
			}
		});
	});
}

function renderSection(column: DashboardColumn, callbacks: RenderCallbacks, app: App): HTMLElement {
	const el = document.createElement('div');
	el.addClass('dashboard-section-row');
	el.dataset.column = column.name;
	el.dataset.sectionType = getSectionType(column);

	const header = el.createDiv({ cls: 'dashboard-section-header' });

	const titleWrap = header.createDiv({ cls: 'dashboard-section-title-wrap' });
	const dot = titleWrap.createDiv({ cls: 'dashboard-section-dot' });
	dot.style.backgroundColor = column.color;
	titleWrap.createEl('h3', { text: column.name, cls: 'dashboard-section-title' });

	const addCardBtn = header.createEl('button', {
		cls: 'dashboard-section-add-btn',
		attr: { 'aria-label': t('renderer.addCardTo', { column: column.name }) },
	});
	setIcon(addCardBtn, 'plus');
	addCardBtn.addEventListener('click', () => callbacks.onCardAdd(column.name));

	const cardsContainer = el.createDiv({ cls: 'dashboard-section-cards' });

	for (const card of column.cards) {
		const cardEl = renderCard(card, column.name, callbacks, app);
		cardsContainer.appendChild(cardEl);
	}

	return el;
}

function renderCard(card: DashboardCard, columnName: string, callbacks: RenderCallbacks, app: App): HTMLElement {
	const el = document.createElement('div');
	el.addClass('dashboard-card', `dashboard-card--${card.type}`);
	el.dataset.cardId = card.id;
	el.setAttribute('draggable', 'true');
	el.setAttribute('role', 'article');
	el.setAttribute('aria-label', card.title);

	if (card.color) {
		el.dataset.hasColor = 'true';
		el.style.setProperty('--db-card-accent', card.color);
	}

	const isMemo = columnName.toLowerCase() === 'memo';
	const isTask = card.type === 'task' || columnName.toLowerCase() === 'todo';
	const isProjectLike = !isMemo && !isTask;

	if (card.coverImage) {
		const resolved = resolveVaultImage(app, card.coverImage);
		if (resolved) {
			const cover = el.createDiv({ cls: 'dashboard-project-cover' });
			cover.style.backgroundImage = `url("${resolved}")`;
		} else if (isProjectLike) {
			el.createDiv({ cls: 'dashboard-project-cover dashboard-project-cover--default' });
		}
	} else if (isProjectLike) {
		el.createDiv({ cls: 'dashboard-project-cover dashboard-project-cover--default' });
	}

	const header = el.createDiv({ cls: 'dashboard-card-header' });
	const titleEl = header.createEl('h4', { text: card.title, cls: 'dashboard-card-title' });

	const skipEditBtn = isMemo || isTask;

	titleEl.addEventListener('dblclick', (e) => {
		e.stopPropagation();
		const currentTitle = titleEl.getText();
		titleEl.empty();
		const input = titleEl.createEl('input', {
			cls: 'dashboard-title-edit-input',
			attr: { type: 'text', value: currentTitle },
		});
		input.focus();
		input.select();

		const finish = (save: boolean) => {
			const newTitle = input.value.trim();
			if (save && newTitle && newTitle !== currentTitle) {
				callbacks.onCardTitleEdit(card.id, newTitle);
			} else {
				titleEl.empty();
				titleEl.setText(currentTitle);
			}
		};

		input.addEventListener('keydown', (ke) => {
			if (ke.key === 'Enter') {
				ke.preventDefault();
				finish(true);
			} else if (ke.key === 'Escape') {
				ke.preventDefault();
				finish(false);
			}
		});

		input.addEventListener('blur', () => {
			finish(true);
		});
	});
	titleEl.style.cursor = 'pointer';

	const actions = header.createDiv({ cls: 'dashboard-card-actions' });

	if (isMemo && (card.type === 'generic' || card.type === 'note')) {
		const colorBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.setMemoColor') },
		});
		setIcon(colorBtn, 'palette');
		if (card.color) {
			colorBtn.style.color = card.color;
		}
		colorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const input = document.createElement('input');
			input.type = 'color';
			input.value = card.color || '#f59e0b';
			input.style.position = 'absolute';
			input.style.opacity = '0';
			input.style.width = '0';
			input.style.height = '0';
			document.body.appendChild(input);
			input.addEventListener('input', () => {
				callbacks.onMemoColorChange(card, input.value);
			});
			input.addEventListener('change', () => {
				if (input.value) {
					callbacks.onMemoColorChange(card, input.value);
				}
				input.remove();
			});
			input.addEventListener('blur', () => {
				input.remove();
			});
			input.click();
		});
	}

	if (!skipEditBtn) {
		const editBtn = actions.createEl('button', {
			cls: 'dashboard-card-btn',
			attr: { 'aria-label': t('renderer.editCard') },
		});
		setIcon(editBtn, 'pencil');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onCardEdit(card);
		});
	}

	const deleteBtn = actions.createEl('button', {
		cls: 'dashboard-card-btn dashboard-card-btn--danger',
		attr: { 'aria-label': t('renderer.deleteCard') },
	});
	setIcon(deleteBtn, 'trash-2');
	deleteBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onCardDelete(card.id);
	});

	const body = el.createDiv({ cls: 'dashboard-card-body' });
	renderCardBody(body, card, columnName, callbacks, app);

	if (card.dueDate) {
		const due = el.createDiv({ cls: 'dashboard-card-due' });
		due.createSpan({ text: card.dueDate });
	}

	return el;
}

function renderCardBody(container: HTMLElement, card: DashboardCard, columnName: string, callbacks: RenderCallbacks, app: App): void {
	const isMemo = columnName.toLowerCase() === 'memo';

	if (card.type === 'task') {
		renderTaskBody(container, card, callbacks);
		return;
	}

	if (isMemo) {
		renderMemoBody(container, card, callbacks);
		return;
	}

	// All non-memo, non-task cards render as project body
	renderProjectBody(container, card, callbacks, app);
}

function renderTaskBody(container: HTMLElement, card: DashboardCard, callbacks: RenderCallbacks): void {
	const list = container.createDiv({ cls: 'dashboard-task-list' });
	let taskDragSrcIndex: number | null = null;

	card.tasks.forEach((task, index) => {
		const item = list.createDiv({ cls: 'dashboard-task-item' });
		item.setAttribute('draggable', 'true');
		item.dataset.taskIndex = String(index);

		const checkbox = item.createEl('input', {
			cls: 'dashboard-task-checkbox',
			attr: { type: 'checkbox' },
		});
		checkbox.checked = task.checked;
		checkbox.addEventListener('change', () => {
			callbacks.onCheckboxToggle(card.id, index, checkbox.checked);
		});

		const displayText = task.text.replace(/\[\[([^\]]+)\]\]/g, (_match, path: string) => {
			const parts = path.split('/');
			return parts[parts.length - 1]!.replace(/\.md$/, '');
		});

		const label = item.createSpan({
			cls: task.checked ? 'dashboard-task-text dashboard-task-text--done' : 'dashboard-task-text',
			text: displayText,
		});
		label.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			const currentText = label.getText();
			label.empty();
			const input = label.createEl('input', {
				cls: 'dashboard-title-edit-input',
				attr: { type: 'text', value: task.text },
			});
			input.focus();
			input.select();

			const finish = (save: boolean) => {
				const newText = input.value.trim();
				if (save && newText && newText !== task.text) {
					callbacks.onTaskEdit(card.id, index, newText);
				} else {
					label.empty();
					label.setText(currentText);
				}
			};

			input.addEventListener('keydown', (ke) => {
				if (ke.key === 'Enter') {
					ke.preventDefault();
					finish(true);
				} else if (ke.key === 'Escape') {
					ke.preventDefault();
					finish(false);
				}
			});

			input.addEventListener('blur', () => {
				finish(true);
			});
		});

		const delBtn = item.createEl('button', {
			cls: 'dashboard-task-delete',
			attr: { 'aria-label': t('renderer.deleteTask') },
		});
		setIcon(delBtn, 'x');
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onTaskDelete(card.id, index);
		});

		item.addEventListener('dragstart', (e) => {
			e.stopPropagation();
			taskDragSrcIndex = index;
			item.addClass('dashboard-task-item--dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', String(index));
			}
		});

		item.addEventListener('dragend', () => {
			item.removeClass('dashboard-task-item--dragging');
			list.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
				(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
			});
			taskDragSrcIndex = null;
		});

		item.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (taskDragSrcIndex === null || taskDragSrcIndex === index) return;
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			list.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
				(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
			});
			item.addClass('dashboard-task-item--drag-over');
		});

		item.addEventListener('dragleave', () => {
			item.removeClass('dashboard-task-item--drag-over');
		});

		item.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			item.removeClass('dashboard-task-item--drag-over');
			if (taskDragSrcIndex === null || taskDragSrcIndex === index) return;
			callbacks.onTaskReorder(card.id, taskDragSrcIndex, index);
		});
	});

	const addRow = container.createDiv({ cls: 'dashboard-task-add' });
	const input = addRow.createEl('input', {
		cls: 'dashboard-task-input',
		attr: { type: 'text', placeholder: t('renderer.addTask') },
	});
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && input.value.trim()) {
			callbacks.onTaskAdd(card.id, input.value.trim());
			input.value = '';
		}
	});

	if (card.tasks.length > 0) {
		const checkedCount = card.tasks.filter(t => t.checked).length;
		const total = card.tasks.length;
		const percent = Math.round((checkedCount / total) * 100);

		const progressWrap = container.createDiv({ cls: 'dashboard-progress' });
		const bar = progressWrap.createDiv({ cls: 'dashboard-progress-bar' });
		bar.createDiv({
			cls: 'dashboard-progress-fill',
			attr: { style: `width: ${percent}%` },
		});
		progressWrap.createSpan({
			cls: 'dashboard-progress-text',
			text: `${percent}%`,
		});
	}
}

function renderMemoBody(container: HTMLElement, card: DashboardCard, callbacks: RenderCallbacks): void {
	const text = [card.blockquote, card.body].filter(Boolean).join('\n');
	let dirty = false;

	const textarea = container.createEl('textarea', {
		cls: 'dashboard-memo-textarea',
		text: text,
		attr: { placeholder: t('renderer.writeThoughts') },
	});

	textarea.addEventListener('input', () => {
		dirty = true;
	});

	const save = () => {
		if (!dirty) return;
		dirty = false;
		const value = textarea.value;
		const lines = value.split('\n');
		const quoteLines: string[] = [];
		const bodyLines: string[] = [];

		for (const line of lines) {
			if (line.startsWith('> ')) {
				quoteLines.push(line.slice(2));
			} else {
				bodyLines.push(line);
			}
		}

		callbacks.onMemoUpdate(card, {
			body: bodyLines.join('\n').trim(),
			blockquote: quoteLines.join('\n'),
		});
	};

	textarea.addEventListener('blur', () => {
		save();
	});
}

function renderNoteBody(container: HTMLElement, card: DashboardCard): void {
	if (card.blockquote) {
		const quote = container.createDiv({ cls: 'dashboard-note-quote' });
		quote.setText(card.blockquote);
	}
	if (card.body) {
		container.createDiv({ cls: 'dashboard-note-body', text: card.body });
	}
}

function renderLinkBody(container: HTMLElement, card: DashboardCard): void {
	const link = container.createEl('a', {
		cls: 'dashboard-link-url',
		attr: { href: card.url, target: '_blank', rel: 'noopener' },
		text: card.url,
	});
	if (card.body) {
		container.createDiv({ cls: 'dashboard-link-desc', text: card.body });
	}
}

function renderProjectBody(container: HTMLElement, card: DashboardCard, callbacks: RenderCallbacks, app: App): void {
	const parseDocPaths = (body: string): string[] =>
		body.split('\n')
			.map(line => line.trim())
			.filter(line => line.startsWith('[[') && line.endsWith(']]'))
			.map(line => line.slice(2, -2));

	const docPaths = parseDocPaths(card.body);

	if (docPaths.length > 0) {
		const docList = container.createDiv({ cls: 'dashboard-project-docs' });
		let docDragSrcIndex: number | null = null;

		docPaths.forEach((docPath, idx) => {
			const file = app.vault.getFileByPath(docPath);
			const docItem = docList.createDiv({ cls: 'dashboard-project-doc-item' });
			docItem.setAttribute('draggable', 'true');
			docItem.dataset.docIndex = String(idx);
			docItem.createSpan({ text: file?.basename ?? docPath.split('/').pop() ?? docPath, cls: 'dashboard-project-doc-name' });

			const removeBtn = docItem.createEl('button', {
				cls: 'dashboard-project-doc-remove',
				attr: { 'aria-label': t('renderer.removeDoc') },
			});
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const currentPaths = parseDocPaths(card.body);
				const newPaths = currentPaths.filter((_, i) => i !== idx);
				callbacks.onProjectDocsUpdate(card, newPaths);
			});

			docItem.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).tagName === 'BUTTON') return;
				const f = app.vault.getFileByPath(docPath);
				if (f) {
					app.workspace.getLeaf(false).openFile(f);
				}
			});

			docItem.addEventListener('dragstart', (e) => {
				e.stopPropagation();
				docDragSrcIndex = idx;
				docItem.addClass('dashboard-task-item--dragging');
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move';
					e.dataTransfer.setData('text/plain', String(idx));
				}
			});

			docItem.addEventListener('dragend', () => {
				docItem.removeClass('dashboard-task-item--dragging');
				docList.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
					(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
				});
				docDragSrcIndex = null;
			});

			docItem.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (docDragSrcIndex === null || docDragSrcIndex === idx) return;
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move';
				}
				docList.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
					(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
				});
				docItem.addClass('dashboard-task-item--drag-over');
			});

			docItem.addEventListener('dragleave', () => {
				docItem.removeClass('dashboard-task-item--drag-over');
			});

			docItem.addEventListener('drop', (e) => {
				e.preventDefault();
				e.stopPropagation();
				docItem.removeClass('dashboard-task-item--drag-over');
				if (docDragSrcIndex === null || docDragSrcIndex === idx) return;
				callbacks.onProjectDocsReorder(card.id, docDragSrcIndex, idx);
			});
		});
	}

	const addDocRow = container.createDiv({ cls: 'dashboard-project-add-doc' });
	const docInput = addDocRow.createEl('input', {
		cls: 'dashboard-task-input',
		attr: { type: 'text', placeholder: t('renderer.addDocument') },
	});

	const docResults = addDocRow.createDiv({ cls: 'dashboard-project-doc-results' });

	docInput.addEventListener('input', () => {
		docResults.empty();
		const q = docInput.value.toLowerCase().trim();
		if (!q) return;

		const currentPaths = parseDocPaths(card.body);
		const files = app.vault.getMarkdownFiles()
			.filter(f => !f.path.startsWith('.'))
			.filter(f => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q))
			.filter(f => !currentPaths.includes(f.path))
			.slice(0, 8);

		for (const file of files) {
			const item = docResults.createDiv({ cls: 'dashboard-project-doc-result' });
			item.setText(file.basename);
			item.addEventListener('click', () => {
				const latestPaths = parseDocPaths(card.body);
				const newPaths = [...latestPaths, file.path];
				callbacks.onProjectDocsUpdate(card, newPaths);
			});
		}
	});

	docInput.addEventListener('blur', () => {
		setTimeout(() => docResults.empty(), 200);
	});
}

function renderHabitBody(container: HTMLElement, card: DashboardCard): void {
	const streakEl = container.createDiv({ cls: 'dashboard-habit-streak' });
	streakEl.createSpan({ cls: 'dashboard-habit-icon', text: '🔥' });
	streakEl.createSpan({ text: t('renderer.dayStreak', { count: card.streak }) });

	if (card.body) {
		container.createDiv({ cls: 'dashboard-habit-body', text: card.body });
	}
}

function getSectionType(column: DashboardColumn): string {
	const lower = column.name.toLowerCase();
	if (lower === 'memo') return 'memo';
	if (lower === 'todo') return 'todo';
	if (lower === 'projects') return 'projects';
	if (column.cards.length > 0) {
		const firstType = column.cards[0]!.type;
		if (firstType === 'task') return 'todo';
		if (firstType === 'project') return 'projects';
	}
	return 'projects';
}
