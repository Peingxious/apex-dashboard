import type { RenderCallbacks } from './types';

interface DnDState {
	draggingCardId: string | null;
	draggingElement: HTMLElement | null;
	sourceColumn: string | null;
	dropIndicator: HTMLElement | null;
}

export function setupDragAndDrop(
	container: HTMLElement,
	callbacks: RenderCallbacks,
	cleanupFns: Array<() => void>,
): void {
	const state: DnDState = {
		draggingCardId: null,
		draggingElement: null,
		sourceColumn: null,
		dropIndicator: null,
	};

	const columns = container.querySelectorAll('.dashboard-section-row');

	columns.forEach((col) => {
		const colEl = col as HTMLElement;
		const columnName = colEl.dataset.column ?? '';

		const cards = colEl.querySelectorAll('.dashboard-card');
		cards.forEach((card) => {
			const cardEl = card as HTMLElement;
			const cardId = cardEl.dataset.cardId ?? '';

			const onDragStart = (e: DragEvent) => {
				state.draggingCardId = cardId;
				state.draggingElement = cardEl;
				state.sourceColumn = columnName;
				cardEl.addClass('dashboard-card--dragging');

				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move';
					e.dataTransfer.setData('text/plain', cardId);
				}
			};

			const onDragEnd = () => {
				cardEl.removeClass('dashboard-card--dragging');
				removeDropIndicator(state);
				clearAllDragOver();
				state.draggingCardId = null;
				state.draggingElement = null;
				state.sourceColumn = null;
			};

			cardEl.addEventListener('dragstart', onDragStart);
			cardEl.addEventListener('dragend', onDragEnd);
			cleanupFns.push(() => {
				cardEl.removeEventListener('dragstart', onDragStart);
				cardEl.removeEventListener('dragend', onDragEnd);
			});

			setupTouchDrag(state, cardEl, cardId, columnName, container, callbacks, cleanupFns);
		});

		const onDragOver = (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			colEl.addClass('dashboard-section-row--drag-over');
			updateDropIndicator(state, colEl, e.clientY);
		};

		const onDragLeave = (e: DragEvent) => {
			const rect = col.getBoundingClientRect();
			if (
				e.clientX < rect.left || e.clientX > rect.right ||
				e.clientY < rect.top || e.clientY > rect.bottom
			) {
				colEl.removeClass('dashboard-section-row--drag-over');
				removeDropIndicator(state);
			}
		};

		const onDrop = (e: DragEvent) => {
			e.preventDefault();
			colEl.removeClass('dashboard-section-row--drag-over');

			if (!state.draggingCardId) return;

			const cardsContainer = colEl.querySelector('.dashboard-section-cards');
			if (!cardsContainer) return;

			const targetIndex = getDropIndex(cardsContainer as HTMLElement, e.clientY);
			const targetColumn = colEl.dataset.column ?? '';

			callbacks.onMoveCard(state.draggingCardId, targetColumn, targetIndex);
			removeDropIndicator(state);
		};

		col.addEventListener('dragover', onDragOver);
		col.addEventListener('dragleave', onDragLeave);
		col.addEventListener('drop', onDrop);
		cleanupFns.push(() => {
			col.removeEventListener('dragover', onDragOver);
			col.removeEventListener('dragleave', onDragLeave);
			col.removeEventListener('drop', onDrop);
		});
	});
}

function getDropIndex(container: HTMLElement, clientY: number): number {
	const cards = Array.from(container.querySelectorAll('.dashboard-card:not(.dashboard-card--dragging)')) as HTMLElement[];
	if (cards.length === 0) return 0;

	for (let i = 0; i < cards.length; i++) {
		const card = cards[i];
		if (!card) continue;
		const rect = card.getBoundingClientRect();
		if (clientY < rect.top + rect.height / 2) {
			return i;
		}
	}

	return cards.length;
}

function updateDropIndicator(state: DnDState, column: HTMLElement, clientY: number): void {
	removeDropIndicator(state);

	const cardsContainer = column.querySelector('.dashboard-section-cards');
	if (!cardsContainer) return;

	const cards = Array.from(cardsContainer.querySelectorAll('.dashboard-card:not(.dashboard-card--dragging)')) as HTMLElement[];
	const indicator = document.createElement('div');
	indicator.addClass('dashboard-drop-indicator');
	state.dropIndicator = indicator;

	if (cards.length === 0) {
		cardsContainer.appendChild(indicator);
		return;
	}

	for (let i = 0; i < cards.length; i++) {
		const card = cards[i];
		if (!card) continue;
		const rect = card.getBoundingClientRect();
		if (clientY < rect.top + rect.height / 2) {
			cardsContainer.insertBefore(indicator, card);
			return;
		}
	}

	cardsContainer.appendChild(indicator);
}

function removeDropIndicator(state: DnDState): void {
	if (state.dropIndicator?.parentNode) {
		state.dropIndicator.parentNode.removeChild(state.dropIndicator);
	}
	state.dropIndicator = null;
}

function clearAllDragOver(): void {
	document.querySelectorAll('.dashboard-section-row--drag-over').forEach((el) => {
		(el as HTMLElement).removeClass('dashboard-section-row--drag-over');
	});
}

function setupTouchDrag(
	state: DnDState,
	cardEl: HTMLElement,
	cardId: string,
	_sourceColumn: string,
	container: HTMLElement,
	callbacks: RenderCallbacks,
	cleanupFns: Array<() => void>,
): void {
	let ghost: HTMLElement | null = null;
	let startX = 0;
	let startY = 0;
	let isDragging = false;
	const LONG_PRESS_MS = 200;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const onTouchStart = (e: TouchEvent) => {
		const t = e.touches[0];
		if (!t) return;
		startX = t.clientX;
		startY = t.clientY;
		isDragging = false;

		timer = setTimeout(() => {
			isDragging = true;
			ghost = createGhost(cardEl, startX, startY);
			cardEl.addClass('dashboard-card--dragging');
		}, LONG_PRESS_MS);
	};

	const onTouchMove = (e: TouchEvent) => {
		if (!isDragging) {
			if (timer) {
				const t = e.touches[0];
				if (!t) return;
				if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
					clearTimeout(timer);
					timer = null;
				}
			}
			return;
		}

		e.preventDefault();
		const t = e.touches[0];
		if (!t) return;

		if (ghost) {
			ghost.style.left = `${t.clientX - ghost.offsetWidth / 2}px`;
			ghost.style.top = `${t.clientY - ghost.offsetHeight / 2}px`;
		}

		const targetCol = findColumnAtPoint(container, t.clientX, t.clientY);
		clearAllDragOver();
		if (targetCol) {
			targetCol.addClass('dashboard-section-row--drag-over');
		}
	};

	const onTouchEnd = (e: TouchEvent) => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}

		if (!isDragging) return;

		if (ghost) {
			ghost.remove();
			ghost = null;
		}
		cardEl.removeClass('dashboard-card--dragging');
		clearAllDragOver();

		const t = e.changedTouches[0];
		if (!t) return;
		const targetCol = findColumnAtPoint(container, t.clientX, t.clientY);

		if (targetCol && targetCol.dataset.column) {
			const cardsContainer = targetCol.querySelector('.dashboard-section-cards');
			const targetIndex = cardsContainer ? getDropIndex(cardsContainer as HTMLElement, t.clientY) : 0;
			callbacks.onMoveCard(cardId, targetCol.dataset.column, targetIndex);
		}
	};

	cardEl.addEventListener('touchstart', onTouchStart, { passive: true });
	cardEl.addEventListener('touchmove', onTouchMove, { passive: false });
	cardEl.addEventListener('touchend', onTouchEnd, { passive: true });

	cleanupFns.push(() => {
		cardEl.removeEventListener('touchstart', onTouchStart);
		cardEl.removeEventListener('touchmove', onTouchMove);
		cardEl.removeEventListener('touchend', onTouchEnd);
	});
}

function createGhost(cardEl: HTMLElement, x: number, y: number): HTMLElement {
	const ghost = cardEl.cloneNode(true) as HTMLElement;
	ghost.addClass('dashboard-card--ghost');
	ghost.style.position = 'fixed';
	ghost.style.width = `${cardEl.offsetWidth}px`;
	ghost.style.left = `${x - cardEl.offsetWidth / 2}px`;
	ghost.style.top = `${y - cardEl.offsetHeight / 2}px`;
	ghost.style.zIndex = '9999';
	ghost.style.pointerEvents = 'none';
	ghost.style.opacity = '0.85';
	ghost.style.transform = 'rotate(3deg)';
	document.body.appendChild(ghost);
	return ghost;
}

function findColumnAtPoint(container: HTMLElement, x: number, y: number): HTMLElement | null {
	const columns = Array.from(container.querySelectorAll('.dashboard-section-row')) as HTMLElement[];
	for (const col of columns) {
		const rect = col.getBoundingClientRect();
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
			return col;
		}
	}
	return null;
}
