/**
 * src/render/state.ts
 *
 * Centralized mutable state for the render layer. The goal of this
 * module is to replace the many `let` / module-level `Map` slots that
 * were scattered across `renderer.ts` (chartInstances,
 * todoPlusRenderGeneration, todoPlusWatchers, taskDragSource,
 * projectItemDragSource, taskItemCallbacks, hoverTimer, etc.).
 *
 * **Status (Step 8.3)**: drag state is now centralised in a mutable
 * `dragState` object so the new `drag-and-drop.ts` module can both
 * read and write it without re-declaring module-level `let` bindings
 * (which TypeScript cannot share across files without an explicit
 * holder object). Chart and TodoPlus state stay as bare Maps and are
 * moved in Steps 8.4.
 *
 * Importing from this file is safe and side-effect-free: the Maps
 * and the `dragState` object are created on first import, identical
 * to the old module-level behaviour.
 */

import type { Chart } from "chart.js";
import type { RenderCallbacks } from "../types";

/**
 * One Chart.js instance per cardId. Replaces the old module-level
 * `chartInstances: Map<string, Chart>` at `renderer.ts:65`.
 * LEAK-002 will be fixed in Step 8.4 by routing card creation /
 * deletion through `chart-pool.ts`.
 */
export const chartInstances = new Map<string, Chart>();

/**
 * Monotonic counter incremented on every TodoPlus re-render request.
 * Used by `renderTodoPlusBody` to discard stale `vault.cachedRead`
 * responses that resolve after a newer render started.
 * Replaces `todoPlusRenderGeneration: Map<string, number>` at
 * `renderer.ts:66`.
 */
export const todoPlusRenderGeneration = new Map<string, number>();

/**
 * Active MutationObserver per TodoPlus card, plus the cached
 * `sourcePath` and the file metadata `ref` (whatever shape the
 * platform exposes — kept as `unknown` until narrowed). Replaces
 * `todoPlusWatchers: Map<…>` at `renderer.ts:67-70`.
 * LEAK-003 will be fixed in Step 8.4 by ensuring each entry calls
 * `observer.disconnect()` when the card is removed.
 */
export const todoPlusWatchers = new Map<
  string,
  { sourcePath: string; ref: unknown; observer: MutationObserver }
>();

/**
 * Drag-and-drop state. Centralised in a single mutable object so
 * `drag-and-drop.ts` (which owns the document-level listeners) and
 * `renderer.ts` (which has a few cross-card listeners of its own)
 * can read and write the same slots without re-declaring them.
 *
 * The object identity is stable across the whole plugin lifetime;
 * the FIELDS are mutable. Read with `dragState.taskDragSource` and
 * write with `dragState.taskDragSource = …`. Setting a field to
 * `null` is the canonical "no drag in flight" state.
 *
 * LEAK-001 (the document-level listeners in the old
 * `ensureItemDocListeners()`) is fixed in Step 8.3 by routing every
 * `addEventListener` through `RenderDisposer`, so the listeners
 * (and the closure that captures `dragState`) are removed on view
 * close.
 */
export interface DragState {
  /** Source of the in-flight task drag. `null` when no drag is active. */
  taskDragSource: { cardId: string; taskIndex: number } | null;
  /** Source of the in-flight project-item drag. See `taskDragSource`. */
  projectItemDragSource: { cardId: string; itemIndex: number } | null;
  /**
   * Last-known render callback bag, set by the dashboard view
   * before rendering and read by drag listeners to mutate cards.
   * Replaces the old `let taskItemCallbacks = null` at
   * `renderer.ts:118`.
   */
  taskItemCallbacks: RenderCallbacks | null;
}

export const dragState: DragState = {
  taskDragSource: null,
  projectItemDragSource: null,
  taskItemCallbacks: null,
};
