/**
 * Test bootstrap for parser tests. Mirrors _loader.mjs but loads
 * the full parser module (which pulls in obsidian, yaml, etc.).
 *
 * jiti's CommonJS mode tolerates the obsidian module graph quirks
 * well enough for our needs — we only exercise pure functions
 * here.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  interopDefault: true,
  esmResolve: true,
});

const parser = jiti("../src/parser.ts");
export const { parse, serialize } = parser;
