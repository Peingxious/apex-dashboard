/**
 * src/render/dashboard/card-bodies/todoplus/index.ts
 *
 * Barrel file for the TodoPlus card body. The v1.5.0 refactor
 * (Step 8.8.0B.4.5) split the original 756-line TodoPlus
 * block of `renderer.ts` into 8 sub-modules; this barrel
 * re-exports them so callers can keep using a single
 * `import { … } from "./render/dashboard/card-bodies/todoplus"`
 * import path.
 *
 * **Why a barrel**: the rest of the card-body types
 * (`memo`, `todo`, `projects`, `weather`, `tracker`) all
 * expose their public API through a single import surface.
 * TodoPlus now follows the same convention, which keeps
 * `renderer.ts` consistent and lets future refactors move
 * sub-modules around without touching call sites.
 *
 * **Behaviour preservation**: this file does not define
 * or wrap any logic. It only re-exports the sub-module
 * functions, so the call-graph and runtime behaviour are
 * byte-for-byte identical to importing each sub-module
 * directly. The previous `renderer.ts` imports
 * (`./render/dashboard/card-bodies/todoplus/...` and the
 * shim import for `ensureTodoPlusHeading`) all keep working
 * unchanged.
 */
export * from "./types";
export * from "./parse";
export * from "./slice";
export * from "./io";
export * from "./render-item";
export * from "./refresh";
export * from "./render-body";
export * from "./modals";
