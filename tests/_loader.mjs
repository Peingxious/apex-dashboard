/**
 * Test bootstrap: re-export the wikilink-context pure-logic functions
 * using `jiti` so the `.test.mjs` can import them as plain JS.
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

export const { findWikilinkContext, applyWikilinkReplacement } = jiti(
  "../src/wikilink-context.ts",
);
