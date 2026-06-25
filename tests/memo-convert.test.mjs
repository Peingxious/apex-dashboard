/**
 * Pure-logic tests for memo conversion helpers.
 *
 * Run with: `node tests/memo-convert.test.mjs`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMemoLinkedBody,
  buildMemoNoteContent,
  buildMemoNotePath,
} from "./_loader.mjs";

test("memo content strips dashboard bullet wrappers before creating note content", () => {
  const note = buildMemoNoteContent({
    body: "- first line\n- second line",
    blockquote: "> - quoted line",
  });
  assert.equal(note, "> quoted line\nfirst line\nsecond line");
});

test("memo title is sanitized into a file base name", () => {
  assert.equal(buildMemoNotePath('  [[A/B]] : memo?  '), "B memo");
  assert.equal(buildMemoNotePath(""), "Untitled");
});

test("converted memo body becomes a wikilink to the new note", () => {
  assert.equal(buildMemoLinkedBody("Notes/Weekly memo.md"), "[[Weekly memo]]");
});
