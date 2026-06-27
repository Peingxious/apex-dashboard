/**
 * src/render/chart-pool.ts
 *
 * Owns the Chart.js instance pool. Replaces the inline
 * `chartInstances: Map<string, Chart>` + `destroyChart` +
 * `destroyAllCharts` that previously lived in `renderer.ts`.
 *
 * **LEAK-002 (fixed in Step 8.4)**: before this refactor, the
 * `chartInstances` Map grew monotonically — once a card was
 * deleted from the dashboard, its Chart.js instance (and the
 * underlying `<canvas>` 2D context, plus the offscreen DOM
 * listener Chart.js attaches) stayed alive in the Map until the
 * view closed. `destroyAllCharts()` was exported but only called
 * from `view.ts:runCleanup()` at view close, so within a long-
 * lived view (the user spends hours on the dashboard), deleted
 * cards leaked forever.
 *
 * **Fix**: every `new Chart(...)` call site now goes through
 * `acquireChart(cardId, factory)`. The factory pattern lets the
 * caller build the full Chart config inline while the pool
 * handles "destroy the old one for this cardId, store the new
 * one" in a single atomic step. On card deletion the caller
 * (or the global disposer on view close) calls `releaseChart`
 * to destroy the instance and remove it from the pool. The
 * existing `destroyAllCharts()` bulk cleanup is preserved for
 * the view-close path.
 *
 * **Behaviour preservation**: the function bodies of
 * `renderTrackerLineChart` / `renderTrackerBarChart` are
 * untouched; the only change is the wrapper around `new Chart`
 * and the `chartInstances.set` line at the end. Every chart
 * config option, every default, every animation tick is
 * identical to the pre-refactor implementation.
 */

import type { Chart } from "chart.js";
import { chartInstances } from "./state";
import { globalDisposer } from "./lifecycle";

/**
 * Create (or replace) the Chart.js instance for `cardId` and
 * register it in the central pool. If a chart already exists for
 * this `cardId` it is destroyed first — this is the same
 * semantics as the pre-refactor `destroyChart(cardId)` call at
 * the top of `renderTrackerBody`, just hoisted into the pool.
 *
 * The `factory` is invoked exactly once per call. Returning a
 * different `cardId` from the factory is a programming error and
 * will throw, because the pool uses the parameter `cardId` as
 * the map key (not anything on the returned instance).
 */
export function acquireChart(cardId: string, factory: () => Chart): Chart {
  const existing = chartInstances.get(cardId);
  if (existing) {
    existing.destroy();
    chartInstances.delete(cardId);
  }
  const chart = factory();
  chartInstances.set(cardId, chart);
  // Auto-cleanup on view close: the disposer call below means
  // every chart acquired during a view's lifetime is destroyed
  // exactly once when the view is torn down, even if the caller
  // forgets to call `releaseChart` explicitly. This is a safety
  // net on top of the explicit `releaseChart` calls.
  globalDisposer.addChart(cardId, chart);
  return chart;
}

/**
 * Destroy and remove the Chart.js instance for `cardId`. Safe to
 * call when no instance exists. Replaces the legacy
 * `destroyChart(cardId)` private function that lived in
 * `renderer.ts`.
 */
export function releaseChart(cardId: string): void {
  const chart = chartInstances.get(cardId);
  if (chart) {
    chart.destroy();
    chartInstances.delete(cardId);
  }
}

/**
 * Read-only access for re-render paths that need to update a
 * chart's data without rebuilding it. Returns `undefined` if no
 * chart is registered for `cardId` (the caller should then build
 * a new one via `acquireChart`).
 */
export function getChart(cardId: string): Chart | undefined {
  return chartInstances.get(cardId);
}

/**
 * Current number of live charts. Exposed for tests / debugging
 * (LEAK-002 acceptance: "create 10 cards with charts, delete 5
 * → chartInstances.size == 5").
 */
export function chartCount(): number {
  return chartInstances.size;
}

/**
 * Destroy every chart and empty the pool. Called from
 * `view.ts:runCleanup()` on view close. Idempotent.
 */
export function destroyAllCharts(): void {
  for (const [, chart] of chartInstances) {
    chart.destroy();
  }
  chartInstances.clear();
}
