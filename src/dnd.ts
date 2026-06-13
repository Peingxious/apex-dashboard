/**
 * Module-level singleton: install document-level drag listeners
 * exactly ONCE for the lifetime of the plugin. Every call to
 * `setupDragAndDrop` registers an additional handler closure into
 * this singleton, and document-level dispatch fans out to all live
 * handlers. This is what makes drag work across re-renders — the
 * kanban wrapper node is rebuilt on every render, so listeners
 * bound to it would get stranded, but `document` is stable.
 *
 * Each handler closure remembers its own `container` so that the
 * `isInDashboard` filter only fires handlers whose container is
 * the current one in the DOM (we use the most recent container).
 */
type DocHandler = (e: DragEvent) => void;
type DocHandlerNoArg = () => void;
const docHandlers: {
  onStart?: DocHandler;
  onOver?: DocHandler;
  onDrop?: DocHandler;
  onEnd?: DocHandlerNoArg;
} = {};
let docListenersInstalled = false;

function ensureDocListeners() {
  if (docListenersInstalled || typeof document === "undefined") return;
  docListenersInstalled = true;
  document.addEventListener("dragstart", (e) => docHandlers.onStart?.(e));
  document.addEventListener("dragover", (e) => docHandlers.onOver?.(e));
  document.addEventListener("drop", (e) => docHandlers.onDrop?.(e));
  document.addEventListener("dragend", () => docHandlers.onEnd?.());
}

export function setupDragAndDrop(
  container: HTMLElement,
  callbacks: {
    onMoveCard?: (
      cardId: string,
      targetColumn: string,
      targetIndex: number,
    ) => void;
  },
  cleanupFns: Array<() => void>,
): void {
  let draggedCardEl: HTMLElement | null = null;
  let draggedCardId: string | null = null;
  let draggedColumn: string | null = null;

  // Resolve the kanban wrapper. setupDragAndDrop is sometimes called
  // with the .dashboard-kanban-wrapper node itself, sometimes with a
  // child. We accept either: the filter walks up to find a
  // .dashboard-kanban-wrapper ancestor.
  const wrapper = container.classList.contains("dashboard-kanban-wrapper")
    ? container
    : ((container.closest(".dashboard-kanban-wrapper") as HTMLElement | null) ??
      container);

  const onDragStart = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a")) {
      e.preventDefault();
      return;
    }
    if (target.closest(".dashboard-task-item, .dashboard-project-item")) return;

    const card = target.closest(".dashboard-card") as HTMLElement | null;
    if (!card) return;

    const sectionRow = card.closest("[data-column]") as HTMLElement | null;
    if (!sectionRow) return;

    draggedCardEl = card;
    draggedCardId = card.dataset.cardId ?? null;
    draggedColumn = sectionRow.dataset.column ?? null;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedCardId ?? "");
      // Set a small drag image to avoid the full card ghost
      const ghost = document.createElement("div");
      ghost.style.width = "200px";
      ghost.style.height = "40px";
      ghost.style.borderRadius = "8px";
      ghost.style.background = "var(--db-accent, #6366f1)";
      ghost.style.opacity = "0.8";
      ghost.style.display = "flex";
      ghost.style.alignItems = "center";
      ghost.style.justifyContent = "center";
      ghost.style.color = "#fff";
      ghost.style.fontSize = "13px";
      ghost.style.fontWeight = "600";
      ghost.style.padding = "0 12px";
      ghost.style.overflow = "hidden";
      ghost.style.whiteSpace = "nowrap";
      ghost.style.textOverflow = "ellipsis";
      ghost.textContent =
        card.querySelector(".dashboard-card-title")?.textContent ??
        card.dataset.cardId ??
        "Card";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 100, 20);
      requestAnimationFrame(() => ghost.remove());
    }

    requestAnimationFrame(() => {
      card.addClass("dashboard-card--dragging");
    });
  };

  const onDragEnd = () => {
    if (draggedCardEl) {
      draggedCardEl.removeClass("dashboard-card--dragging");
    }
    container
      .querySelectorAll(".dashboard-section-row--drag-over")
      .forEach((el) => {
        el.classList.remove("dashboard-section-row--drag-over");
      });
    draggedCardEl = null;
    draggedCardId = null;
    draggedColumn = null;
  };

  const onDragOver = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    // Always call preventDefault on dragover so the browser will
    // fire the corresponding drop event. The project-item / task-item
    // branches in renderer.ts handle the visual feedback and final
    // drop themselves; we still need preventDefault here, otherwise
    // the browser cancels drop when the cursor is over those items.
    if (target.closest(".dashboard-task-item, .dashboard-project-item")) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (!draggedCardId) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    const sectionRow = target.closest("[data-column]") as HTMLElement | null;

    // Clear old indicators
    container
      .querySelectorAll(".dashboard-section-row--drag-over")
      .forEach((el) => {
        el.classList.remove("dashboard-section-row--drag-over");
      });

    // Highlight the target column
    if (sectionRow) {
      sectionRow.classList.add("dashboard-section-row--drag-over");
    }
  };

  const onDrop = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".dashboard-task-item, .dashboard-project-item")) {
      // Item-level drop is handled by the document-level drop listener
      // installed in renderer.ts (ensureItemDocListeners). Don't try
      // to process it as a card-move here — just allow the event to
      // continue to that handler.
      return;
    }
    e.preventDefault();

    container
      .querySelectorAll(".dashboard-section-row--drag-over")
      .forEach((el) => {
        el.classList.remove("dashboard-section-row--drag-over");
      });

    if (!draggedCardId || !draggedCardEl || !callbacks.onMoveCard) return;

    const targetCard = target.closest(".dashboard-card") as HTMLElement | null;
    const targetSectionRow = target.closest(
      "[data-column]",
    ) as HTMLElement | null;

    if (!targetSectionRow) return;

    const targetColumn = targetSectionRow.dataset.column;
    if (!targetColumn) return;

    // Get all cards in the target column
    const cardsContainer = targetSectionRow.querySelector(
      ".dashboard-section-cards",
    );
    if (!cardsContainer) return;

    const cards = Array.from(
      cardsContainer.querySelectorAll(":scope > .dashboard-card"),
    );

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

  // Install document-level listeners exactly once for the plugin's
  // lifetime. The `onDragStart/Over/Drop/End` handlers below are
  // routed into the module-level singleton via a per-instance
  // adapter. The filter `isInDashboard` ignores events that didn't
  // originate inside any `.dashboard-kanban-wrapper` ancestor of
  // the current event target — so the singleton is safe across
  // multiple plugin instances / workspace restarts.
  const isInDashboard = (n: EventTarget | null): boolean => {
    let cur = n as HTMLElement | null;
    while (cur) {
      if (cur.classList && cur.classList.contains("dashboard-kanban-wrapper")) {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  };

  ensureDocListeners();
  docHandlers.onStart = (e: DragEvent) => {
    if (!isInDashboard(e.target)) return;
    onDragStart(e);
  };
  docHandlers.onOver = (e: DragEvent) => {
    if (!isInDashboard(e.target)) return;
    onDragOver(e);
  };
  docHandlers.onDrop = (e: DragEvent) => {
    if (!isInDashboard(e.target)) return;
    onDrop(e);
  };
  docHandlers.onEnd = () => {
    // onDragEnd only operates on state captured in this closure
    // (draggedCardEl etc.), so it's safe to always invoke — if no
    // drag is in progress the inner checks early-out.
    onDragEnd();
  };

  // Container-level listeners are kept as a best-effort fallback.
  // The document-level listeners above are the source of truth and
  // survive dashboard re-renders (which replace the kanban wrapper).
  container.addEventListener("dragstart", onDragStart);
  container.addEventListener("dragover", onDragOver);
  container.addEventListener("drop", onDrop);
  container.addEventListener("dragend", onDragEnd);

  console.log(
    "[dbg-dnd] setup kanban.cards=" +
      container.querySelectorAll(".dashboard-card").length,
  );

  // Document-level listeners are never removed (plugin-lifetime
  // singleton). The container-level listeners are cleaned up in
  // cleanupFns and may be re-installed by the next render. Since
  // document listeners always filter by isInDashboard (the current
  // event target's wrapper ancestor), a stale docHandler simply
  // does nothing — its onDragStart sees a wrapper that's no longer
  // connected to the document, so isInDashboard returns false.
  cleanupFns.push(() => {
    container.removeEventListener("dragstart", onDragStart);
    container.removeEventListener("dragover", onDragOver);
    container.removeEventListener("drop", onDrop);
    container.removeEventListener("dragend", onDragEnd);
  });
}
