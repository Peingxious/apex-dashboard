/**
 * src/render/lifecycle.ts
 *
 * Centralized resource disposal. The render layer produces many
 * transient resources (DOM event listeners, setTimeout handles,
 * requestAnimationFrame IDs, MutationObservers, Chart.js
 * instances) that need to be torn down when the dashboard view
 * closes; otherwise LEAK-001 / LEAK-002 / LEAK-003 happen.
 *
 * **Status (Step 8.1)**: skeleton only. `RenderDisposer` is fully
 * typed and ready to accept registrations, but no call sites
 * register with it yet — that happens in Step 8.3 (drag listeners)
 * and 8.4 (chart pool / todoplus watcher). Until then, the old
 * behaviour (no cleanup) is preserved 1:1.
 *
 * **Public API (target, post-Step 8.4)**:
 *
 *   const disposer = new RenderDisposer();
 *   disposer.addEventListener(target, type, handler, options);
 *   disposer.addTimeout(handle);
 *   disposer.addObserver(observer);
 *   disposer.addChart(cardId, chart);
 *
 *   // Called from `view.ts:onClose`:
 *   disposer.dispose();
 *
 *   // Global reset (test / plugin-reload safety):
 *   disposeAllRenderers();
 */

import { chartInstances } from "./state";

/** Anything that has a `destroy` / `disconnect` / `dispose` method. */
type Disposable = { destroy: () => void; disconnect?: () => void };

/** Stored registration tuple. */
interface Registration {
  kind: "event" | "timeout" | "raf" | "observer" | "chart" | "custom";
  /** Uniquely identifying handle for debugging. */
  label: string;
  /** The actual cleanup action. */
  cleanup: () => void;
}

/**
 * Disposer holds every transient resource a render pass registers,
 * and tears them all down on `dispose()`. Idempotent: calling
 * `dispose()` twice is safe.
 */
export class RenderDisposer {
  private readonly registrations: Registration[] = [];
  private disposed = false;

  /**
   * Add a DOM event listener. The cleanup callback calls
   * `target.removeEventListener(type, handler, options)`.
   */
  addEventListener<K extends keyof GlobalEventHandlersEventMap>(
    target: GlobalEventHandlers,
    type: K,
    handler: (ev: GlobalEventHandlersEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (this.disposed) return;
    target.addEventListener(type, handler, options);
    this.registrations.push({
      kind: "event",
      label: `event:${type}`,
      cleanup: () => target.removeEventListener(type, handler, options),
    });
  }

  /**
   * Add a `setTimeout` handle. Cleanup calls `clearTimeout`.
   */
  addTimeout(handle: number, label = "timeout"): void {
    if (this.disposed) {
      window.clearTimeout(handle);
      return;
    }
    this.registrations.push({
      kind: "timeout",
      label,
      cleanup: () => window.clearTimeout(handle),
    });
  }

  /**
   * Add a `requestAnimationFrame` handle. Cleanup calls
   * `cancelAnimationFrame`.
   */
  addRaf(handle: number, label = "raf"): void {
    if (this.disposed) {
      window.cancelAnimationFrame(handle);
      return;
    }
    this.registrations.push({
      kind: "raf",
      label,
      cleanup: () => window.cancelAnimationFrame(handle),
    });
  }

  /**
   * Add a `MutationObserver` (or any `Disposable`). Cleanup calls
   * `disconnect()` then `destroy()`.
   */
  addObserver(observer: Disposable, label = "observer"): void {
    if (this.disposed) {
      observer.disconnect?.();
      return;
    }
    this.registrations.push({
      kind: "observer",
      label,
      cleanup: () => {
        observer.disconnect?.();
        observer.destroy();
      },
    });
  }

  /**
   * Register a Chart.js instance under a cardId. Cleanup calls
   * `chart.destroy()` AND removes it from the central `chartInstances`
   * Map (so re-renders don't see the stale entry).
   *
   * Note: the import of `chartInstances` would create a cycle if
   * `state.ts` imported this file. We keep the import one-way:
   * `chart-pool.ts` (Step 8.4) will own the actual registration.
   * This method here only does disposal.
   */
  addChart(cardId: string, chart: import("chart.js").Chart): void {
    if (this.disposed) {
      chart.destroy();
      return;
    }
    this.registrations.push({
      kind: "chart",
      label: `chart:${cardId}`,
      // Lazy lookup by cardId so explicit `releaseChart(cardId)`
      // (which removes the entry from the pool) makes this
      // cleanup a no-op. Prevents double-destroy when both
      // releaseChart and view-close try to destroy the same
      // instance.
      cleanup: () => {
        if (chartInstances.get(cardId) === chart) {
          chart.destroy();
          chartInstances.delete(cardId);
        }
      },
    });
  }

  /**
   * Register an arbitrary cleanup. Use sparingly; prefer the typed
   * helpers above.
   */
  addCustom(label: string, cleanup: () => void): void {
    if (this.disposed) {
      cleanup();
      return;
    }
    this.registrations.push({ kind: "custom", label, cleanup });
  }

  /**
   * Run every registered cleanup in REVERSE order, then mark the
   * disposer disposed. Safe to call multiple times.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.registrations.length - 1; i >= 0; i--) {
      try {
        this.registrations[i]!.cleanup();
      } catch (err) {
        // Best-effort cleanup. Log but do not throw; one broken
        // registration must not prevent the others from running.
        // eslint-disable-next-line no-console
        console.error("[RenderDisposer] cleanup failed", err);
      }
    }
    this.registrations.length = 0;
  }

  /** True if `dispose()` has run. */
  isDisposed(): boolean {
    return this.disposed;
  }

  /** Number of live registrations (for tests / debugging). */
  size(): number {
    return this.registrations.length;
  }
}

/**
 * Shared global disposer. The dashboard view creates one on
 * `onOpen` and calls `dispose()` from `onClose`. Sub-files (the
 * drag-and-drop module, the chart pool, the TodoPlus watcher)
 * register against this global so they can be torn down without
 * threading a disposer argument through every helper.
 *
 * **Status (Step 8.1)**: not yet wired up. `view.ts` does not
 * create or dispose this; the migration happens in Step 8.3.
 */
export const globalDisposer = new RenderDisposer();

/**
 * Convenience: dispose the global disposer and create a fresh
 * one. Idempotent; safe to call multiple times.
 */
export function disposeAllRenderers(): void {
  globalDisposer.dispose();
}
