/**
 * src/render/drag-and-drop.ts
 *
 * Owns the document-level drag-and-drop listeners for the dashboard.
 * Replaces the old `ensureItemDocListeners()` function and the
 * `let itemDocListenersInstalled` flag at `renderer.ts:118-119`,
 * fixing LEAK-001 in the process.
 *
 * **LEAK-001**: the original `ensureItemDocListeners()` called
 * `document.addEventListener('dragstart' / 'dragend' / 'dragover' /
 * 'dragleave' / 'drop', …)` exactly once for the whole plugin
 * lifetime, with no `removeEventListener` counterpart. Every time
 * the dashboard view closed, its `taskItemCallbacks` closure stayed
 * alive because the document listener still held a reference to the
 * callbacks. Opening and closing the view N times left N copies of
 * the listener on `document`, all reading the same stale
 * `taskItemCallbacks` and the same `taskDragSource` / module-level
 * state.
 *
 * **Fix (Step 8.3)**: every listener is registered via
 * `globalDisposer.addEventListener(...)`, and the dashboard view
 * calls `disposeAllRenderers()` in `onClose()`. The first view
 * open creates the listeners; every subsequent view open
 * re-creates them (the old ones were disposed); the close tears
 * them down. After N open/close cycles the document has exactly
 * the listeners registered by the current view (or 0 if the view
 * is closed). No accumulation.
 *
 * State (drag source / callbacks) is read from / written to
 * `dragState` in `./state.ts` so the rest of `renderer.ts` keeps
 * the same read/write pattern (it just imports the object instead
 * of referencing module-level `let`s).
 *
 * **Status (Step 8.3)**: extracted as a standalone module. The
 * `installDocumentDragListeners()` entry point is called from
 * `renderer.ts` (replacing the old `ensureItemDocListeners()`
 * call sites). Behaviour is 1:1 identical to the old code: the
 * five listeners do exactly what they used to, in exactly the same
 * order, with the same DOM queries and the same callback paths.
 */

import { CSS } from "./constants";
import { dragState } from "./state";
import { globalDisposer } from "./lifecycle";

/**
 * Add `dashboard-task-item--drag-over`, `dashboard-project-item--
 * drag-over`, and `dashboard-task-list--drop-target` cleanup to
 * any element currently marked. Extracted verbatim from
 * `renderer.ts:121-134`.
 */
function clearDragOverClasses(): void {
  document.querySelectorAll(`.${CSS.taskItemDragOver}`).forEach((el) => {
    (el as HTMLElement).classList.remove(CSS.taskItemDragOver);
  });
  document
    .querySelectorAll(`.${CSS.projectItemDragOver}`)
    .forEach((el) => {
      (el as HTMLElement).classList.remove(CSS.projectItemDragOver);
    });
  document
    .querySelectorAll(`.${CSS.taskListDropTarget}`)
    .forEach((el) => {
      (el as HTMLElement).classList.remove(CSS.taskListDropTarget);
    });
}

/**
 * Install the five document-level drag-and-drop listeners. Safe
 * to call multiple times within a view lifetime: each call creates
 * a fresh batch of registrations on the current `globalDisposer`;
 * previous registrations from the same view are still active
 * until the view closes (and disposes them all in one shot).
 *
 * **Wire-up**: every `addEventListener` is replaced with
 * `globalDisposer.addEventListener(document, type, handler, …)`
 * so the listener is removed in `disposeAllRenderers()`.
 */
export function installDocumentDragListeners(): void {
  if (typeof document === "undefined") return;

  // -----------------------------------------------------------------
  // dragstart
  // -----------------------------------------------------------------
  globalDisposer.addEventListener(
    document,
    "dragstart",
    (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, input, textarea, select, a")) return;

      const taskItem = target.closest(
        `.${CSS.taskItem}`,
      ) as HTMLElement | null;
      if (taskItem) {
        const cardId = taskItem.dataset.cardId;
        const taskIndexStr = taskItem.dataset.taskIndex;
        if (!cardId || taskIndexStr === undefined) return;
        const taskIndex = parseInt(taskIndexStr, 10);
        if (isNaN(taskIndex)) return;
        dragState.taskDragSource = { cardId, taskIndex };
        taskItem.addClass(CSS.taskItemDragging);
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(taskIndex));
        }
        return;
      }

      const projectItem = target.closest(
        `.${CSS.projectItem}`,
      ) as HTMLElement | null;
      if (projectItem) {
        const cardId = projectItem.dataset.cardId;
        const itemIndexStr = projectItem.dataset.itemIndex;
        if (!cardId || itemIndexStr === undefined) return;
        const itemIndex = parseInt(itemIndexStr, 10);
        if (isNaN(itemIndex)) return;
        dragState.projectItemDragSource = { cardId, itemIndex };
        projectItem.addClass(CSS.projectItemDragging);
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(itemIndex));
        }
        return;
      }
    },
  );

  // -----------------------------------------------------------------
  // dragend
  // -----------------------------------------------------------------
  globalDisposer.addEventListener(document, "dragend", (e) => {
    const target = e.target as HTMLElement;
    const taskItem = target.closest(
      `.${CSS.taskItem}`,
    ) as HTMLElement | null;
    if (taskItem) {
      taskItem.classList.remove(CSS.taskItemDragging);
      clearDragOverClasses();
      dragState.taskDragSource = null;
      return;
    }
    const projectItem = target.closest(
      `.${CSS.projectItem}`,
    ) as HTMLElement | null;
    if (projectItem) {
      projectItem.classList.remove(CSS.projectItemDragging);
      clearDragOverClasses();
      dragState.projectItemDragSource = null;
      return;
    }
    clearDragOverClasses();
  });

  // -----------------------------------------------------------------
  // dragover
  // -----------------------------------------------------------------
  globalDisposer.addEventListener(document, "dragover", (e) => {
    const target = e.target as HTMLElement;

    const taskItem = target.closest(
      `.${CSS.taskItem}`,
    ) as HTMLElement | null;
    if (taskItem && dragState.taskDragSource) {
      const cardId = taskItem.dataset.cardId;
      const taskIndex = parseInt(taskItem.dataset.taskIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(taskIndex) &&
        !(
          dragState.taskDragSource.cardId === cardId &&
          dragState.taskDragSource.taskIndex === taskIndex
        )
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearDragOverClasses();
        taskItem.addClass(CSS.taskItemDragOver);
        return;
      }
    }

    const projectItem = target.closest(
      `.${CSS.projectItem}`,
    ) as HTMLElement | null;
    if (projectItem && dragState.projectItemDragSource) {
      const cardId = projectItem.dataset.cardId;
      const itemIndex = parseInt(projectItem.dataset.itemIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(itemIndex) &&
        !(
          dragState.projectItemDragSource.cardId === cardId &&
          dragState.projectItemDragSource.itemIndex === itemIndex
        )
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearDragOverClasses();
        projectItem.addClass(CSS.projectItemDragOver);
        return;
      }
    }

    const emptyTaskList = target.closest(
      ".dashboard-task-list",
    ) as HTMLElement | null;
    if (emptyTaskList && dragState.taskDragSource) {
      const containerCard = emptyTaskList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !== dragState.taskDragSource.cardId
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearDragOverClasses();
        emptyTaskList.addClass(CSS.taskListDropTarget);
        return;
      }
    }

    const emptyProjectList = target.closest(
      ".dashboard-project-list",
    ) as HTMLElement | null;
    if (emptyProjectList && dragState.projectItemDragSource) {
      const containerCard = emptyProjectList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !==
          dragState.projectItemDragSource.cardId
      ) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        clearDragOverClasses();
        emptyProjectList.addClass(CSS.taskListDropTarget);
        return;
      }
    }
  });

  // -----------------------------------------------------------------
  // dragleave
  // -----------------------------------------------------------------
  globalDisposer.addEventListener(document, "dragleave", (e) => {
    const target = e.target as HTMLElement;
    const taskList = target.closest(
      ".dashboard-task-list",
    ) as HTMLElement | null;
    if (taskList && !taskList.contains(e.relatedTarget as Node)) {
      taskList.classList.remove(CSS.taskListDropTarget);
    }
    const projectList = target.closest(
      ".dashboard-project-list",
    ) as HTMLElement | null;
    if (projectList && !projectList.contains(e.relatedTarget as Node)) {
      projectList.classList.remove(CSS.taskListDropTarget);
    }
  });

  // -----------------------------------------------------------------
  // drop
  // -----------------------------------------------------------------
  globalDisposer.addEventListener(document, "drop", (e) => {
    const target = e.target as HTMLElement;
    if (!dragState.taskItemCallbacks) {
      return;
    }

    const taskItem = target.closest(
      `.${CSS.taskItem}`,
    ) as HTMLElement | null;
    if (taskItem && dragState.taskDragSource) {
      const cardId = taskItem.dataset.cardId;
      const taskIndex = parseInt(taskItem.dataset.taskIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(taskIndex) &&
        !(
          dragState.taskDragSource.cardId === cardId &&
          dragState.taskDragSource.taskIndex === taskIndex
        )
      ) {
        e.preventDefault();
        clearDragOverClasses();
        if (dragState.taskDragSource.cardId === cardId) {
          dragState.taskItemCallbacks.onTaskReorder(
            cardId,
            dragState.taskDragSource.taskIndex,
            taskIndex,
          );
        } else {
          dragState.taskItemCallbacks.onTaskMoveToCard(
            dragState.taskDragSource.cardId,
            dragState.taskDragSource.taskIndex,
            cardId,
            taskIndex,
          );
        }
        dragState.taskDragSource = null;
        return;
      }
    }

    const emptyTaskList = target.closest(
      ".dashboard-task-list",
    ) as HTMLElement | null;
    if (emptyTaskList && dragState.taskDragSource) {
      const containerCard = emptyTaskList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !== dragState.taskDragSource.cardId
      ) {
        const numTasks = emptyTaskList.querySelectorAll(
          `.${CSS.taskItem}`,
        ).length;
        dragState.taskItemCallbacks.onTaskMoveToCard(
          dragState.taskDragSource.cardId,
          dragState.taskDragSource.taskIndex,
          containerCard.dataset.cardId ?? "",
          numTasks,
        );
        clearDragOverClasses();
        dragState.taskDragSource = null;
        return;
      }
    }

    const projectItem = target.closest(
      `.${CSS.projectItem}`,
    ) as HTMLElement | null;
    if (projectItem && dragState.projectItemDragSource) {
      const cardId = projectItem.dataset.cardId;
      const itemIndex = parseInt(projectItem.dataset.itemIndex ?? "-1", 10);
      if (
        cardId &&
        !isNaN(itemIndex) &&
        !(
          dragState.projectItemDragSource.cardId === cardId &&
          dragState.projectItemDragSource.itemIndex === itemIndex
        )
      ) {
        e.preventDefault();
        clearDragOverClasses();
        if (dragState.projectItemDragSource.cardId === cardId) {
          dragState.taskItemCallbacks.onProjectItemReorder(
            cardId,
            dragState.projectItemDragSource.itemIndex,
            itemIndex,
          );
        } else {
          dragState.taskItemCallbacks.onProjectItemMoveToCard(
            dragState.projectItemDragSource.cardId,
            dragState.projectItemDragSource.itemIndex,
            cardId,
            itemIndex,
          );
        }
        dragState.projectItemDragSource = null;
        return;
      }
    }

    const emptyProjectList = target.closest(
      ".dashboard-project-list",
    ) as HTMLElement | null;
    if (emptyProjectList && dragState.projectItemDragSource) {
      const containerCard = emptyProjectList.closest(
        ".dashboard-card",
      ) as HTMLElement | null;
      if (
        containerCard &&
        containerCard.dataset.cardId !==
          dragState.projectItemDragSource.cardId
      ) {
        dragState.taskItemCallbacks.onProjectItemMoveToCard(
          dragState.projectItemDragSource.cardId,
          dragState.projectItemDragSource.itemIndex,
          containerCard.dataset.cardId ?? "",
          0,
        );
        clearDragOverClasses();
        dragState.projectItemDragSource = null;
        return;
      }
    }
  });
}
