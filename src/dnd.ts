export function setupDragAndDrop(
    container: HTMLElement,
    callbacks: { onMoveCard?: (cardId: string, targetColumn: string, targetIndex: number) => void },
    cleanupFns: Array<() => void>
): void {
    let draggedCardEl: HTMLElement | null = null;
    let draggedCardId: string | null = null;
    let draggedColumn: string | null = null;

    const onDragStart = (e: DragEvent) => {
        // Don't start drag from buttons/inputs/links
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, select, a')) {
            e.preventDefault();
            return;
        }

        const card = target.closest('.dashboard-card') as HTMLElement | null;
        if (!card) return;

        const sectionRow = card.closest('[data-column]') as HTMLElement | null;
        if (!sectionRow) return;

        draggedCardEl = card;
        draggedCardId = card.dataset.cardId ?? null;
        draggedColumn = sectionRow.dataset.column ?? null;

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedCardId ?? '');
            // Set a small drag image to avoid the full card ghost
            const ghost = document.createElement('div');
            ghost.style.width = '200px';
            ghost.style.height = '40px';
            ghost.style.borderRadius = '8px';
            ghost.style.background = 'var(--db-accent, #6366f1)';
            ghost.style.opacity = '0.8';
            ghost.style.display = 'flex';
            ghost.style.alignItems = 'center';
            ghost.style.justifyContent = 'center';
            ghost.style.color = '#fff';
            ghost.style.fontSize = '13px';
            ghost.style.fontWeight = '600';
            ghost.style.padding = '0 12px';
            ghost.style.overflow = 'hidden';
            ghost.style.whiteSpace = 'nowrap';
            ghost.style.textOverflow = 'ellipsis';
            ghost.textContent = card.querySelector('.dashboard-card-title')?.textContent ?? card.dataset.cardId ?? 'Card';
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 100, 20);
            requestAnimationFrame(() => ghost.remove());
        }

        requestAnimationFrame(() => {
            card.addClass('dashboard-card--dragging');
        });
    };

    const onDragEnd = () => {
        if (draggedCardEl) {
            draggedCardEl.removeClass('dashboard-card--dragging');
        }
        container.querySelectorAll('.dashboard-section-row--drag-over').forEach(el => {
            el.classList.remove('dashboard-section-row--drag-over');
        });
        draggedCardEl = null;
        draggedCardId = null;
        draggedColumn = null;
    };

    const onDragOver = (e: DragEvent) => {
        e.preventDefault();
        if (!draggedCardId) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const target = e.target as HTMLElement;
        const sectionRow = target.closest('[data-column]') as HTMLElement | null;

        // Clear old indicators
        container.querySelectorAll('.dashboard-section-row--drag-over').forEach(el => {
            el.classList.remove('dashboard-section-row--drag-over');
        });

        // Highlight the target column
        if (sectionRow) {
            sectionRow.classList.add('dashboard-section-row--drag-over');
        }
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();

        // Clean up visual indicators
        container.querySelectorAll('.dashboard-section-row--drag-over').forEach(el => {
            el.classList.remove('dashboard-section-row--drag-over');
        });

        if (!draggedCardId || !draggedCardEl || !callbacks.onMoveCard) return;

        const target = e.target as HTMLElement;
        const targetCard = target.closest('.dashboard-card') as HTMLElement | null;
        const targetSectionRow = target.closest('[data-column]') as HTMLElement | null;

        if (!targetSectionRow) return;

        const targetColumn = targetSectionRow.dataset.column;
        if (!targetColumn) return;

        // Get all cards in the target column
        const cardsContainer = targetSectionRow.querySelector('.dashboard-section-cards');
        if (!cardsContainer) return;

        const cards = Array.from(cardsContainer.querySelectorAll(':scope > .dashboard-card'));

        // Calculate target index
        let targetIndex: number;
        if (targetCard && targetCard !== draggedCardEl) {
            targetIndex = cards.indexOf(targetCard);
            if (targetIndex === -1) targetIndex = cards.length;
        } else {
            targetIndex = cards.length; // append at end
        }

        // If dropping in the same column at the same position, skip
        if (targetColumn === draggedColumn) {
            const currentIdx = cards.indexOf(draggedCardEl);
            if (currentIdx === targetIndex) return;
        }

        // Trigger the move
        callbacks.onMoveCard(draggedCardId, targetColumn, targetIndex);

        // Clean up
        onDragEnd();
    };

    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    container.addEventListener('dragend', onDragEnd);

    cleanupFns.push(() => {
        container.removeEventListener('dragstart', onDragStart);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('drop', onDrop);
        container.removeEventListener('dragend', onDragEnd);
    });
}
