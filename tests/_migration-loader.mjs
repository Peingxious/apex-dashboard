/**
 * Test bootstrap: load parser.ts (which imports obsidian) via `jiti`
 * in CommonJS mode so the `.test.mjs` can use the pure functions
 * without dragging in the full Obsidian module graph.
 *
 * We isolate the loader here so the test file itself stays focused
 * on the test cases.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  interopDefault: true,
  esmResolve: true,
});

// Load parser.ts and pull out the helper. The parser file imports
// `obsidian` and `yaml` at the top — jiti in CommonJS mode is
// tolerant of those module-graph quirks.
const parser = jiti("../src/parser.ts");
export const { migrateCardsForSectionType } = parser;
