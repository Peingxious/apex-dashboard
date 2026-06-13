/**
 * Pure-logic unit tests for `src/wikilink-context.ts`.
 *
 * Run with:  node tests/wikilink-context.test.mjs
 *
 * Verifies the three bug-fix requirements from the 1.1.16 review:
 *   1. "会出现2个下拉框" → the dropdown should open ONLY when the
 *      caret is inside `[[…` (or `【【…`), not for plain text.
 *   2. "输入[[和【【都应该触发" → both ASCII and full-width openers
 *      must be accepted.
 *   3. "不是替换内容！我输入前面的文字也会要有！" → picking a file
 *      must keep the leading text typed before the opener intact.
 *
 * The test imports the source via `tests/_loader.mjs`, which uses
 * `jiti` (a devDep) to load TypeScript on the fly without a build.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { findWikilinkContext, applyWikilinkReplacement } from "./_loader.mjs";

// ---------- findWikilinkContext -------------------------------------------

test("plain text without any opener → null", () => {
  assert.equal(findWikilinkContext("hello world", 11), null);
  assert.equal(findWikilinkContext("", 0), null);
  assert.equal(findWikilinkContext("12", 2), null);
  assert.equal(findWikilinkContext("中文测试", 4), null);
});

test("single [ does NOT trigger the dropdown", () => {
  // Only ONE bracket — not a valid opener pair.
  assert.equal(findWikilinkContext("a[b", 3), null);
  assert.equal(findWikilinkContext("[", 1), null);
});

test("ASCII [[ alone opens the dropdown with empty query", () => {
  const ctx = findWikilinkContext("[[", 2);
  assert.deepEqual(ctx, { start: 0, query: "", open: "[[", close: "]]" });
});

test("full-width 【【 alone opens the dropdown with empty query", () => {
  // The Chinese full-width opener must trigger the dropdown just
  // like ASCII. This is the "输入[[和【【都应该触发" requirement.
  const ctx = findWikilinkContext("【【", 2);
  assert.deepEqual(ctx, { start: 0, query: "", open: "【【", close: "】】" });
});

test("ASCII [[dash returns the partial query and ASCII brackets", () => {
  const ctx = findWikilinkContext("[[dash", 6);
  assert.deepEqual(ctx, { start: 0, query: "dash", open: "[[", close: "]]" });
});

test("full-width 【【abc returns the partial query and full-width brackets", () => {
  const ctx = findWikilinkContext("【【abc", 5);
  assert.deepEqual(ctx, {
    start: 0,
    query: "abc",
    open: "【【",
    close: "】】",
  });
});

test("[[dash]] at the end of input → null (link already closed)", () => {
  // The user has typed past the closing brackets, so the dropdown
  // must NOT stay open.
  assert.equal(findWikilinkContext("[[dash]]", 8), null);
});

test("[[dash]] in the middle, caret past the close → null", () => {
  assert.equal(findWikilinkContext("[[dash]] end", 12), null);
});

test("second [[ in `[[a]] [[b` resolves to the second link", () => {
  // The user typed TWO links; the dropdown should drive the
  // second one, not the first.
  const ctx = findWikilinkContext("[[a]] [[b", 9);
  assert.deepEqual(ctx, { start: 6, query: "b", open: "[[", close: "]]" });
});

test("alias syntax `[[path|alias]]` is treated as closed", () => {
  assert.equal(findWikilinkContext("[[path|alias]]", 14), null);
});

test("section syntax `[[path#sec]]` is treated as closed", () => {
  assert.equal(findWikilinkContext("[[path#sec]]", 12), null);
});

test("newline inside the query → null (illegal in a wikilink)", () => {
  assert.equal(findWikilinkContext("[[abc\ndef", 8), null);
});

test("stray leading [[ in `[[[abc` resolves to the SECOND pair", () => {
  // The first two `[` are a stray sequence; the real opener is
  // the second pair (indices 1..3), so the query should be `abc`.
  const ctx = findWikilinkContext("[[[abc", 6);
  assert.deepEqual(ctx, { start: 1, query: "abc", open: "[[", close: "]]" });
});

test("stray leading 【【 in `【【【abc` resolves to the second pair", () => {
  // The first `【` is stray; the real opener is the second `【【`
  // starting at index 1 (chars 1..2), so the query is `abc`.
  const ctx = findWikilinkContext("【【【abc", 6);
  assert.deepEqual(ctx, { start: 1, query: "abc", open: "【【", close: "】】" });
});

test("leading text BEFORE [[ is part of the value but NOT the query", () => {
  // This is the "我输入前面的文字也会要有" requirement: the prefix
  // typed before the opener must NOT be wiped on pick. The query
  // returned by findWikilinkContext is just the wikilink portion;
  // applyWikilinkReplacement handles the prefix preservation.
  const value = "review [[xyz";
  const caret = value.length;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  assert.equal(ctx.start, 7); // position of `[[`
  assert.equal(ctx.query, "xyz");
  assert.equal(ctx.open, "[[");
});

test("leading text BEFORE 【【 returns the full-width opener", () => {
  const value = "笔记 【【abc";
  const caret = value.length;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  assert.equal(ctx.open, "【【");
  assert.equal(ctx.query, "abc");
});

test("mixed 【【 opener with ASCII ]] closer → null (closed)", () => {
  // User typed `【【abc]]` — the `]]` after `abc` closes the link
  // even though it doesn't match the opener's family.
  assert.equal(findWikilinkContext("【【abc]]", 7), null);
});

test("mixed [[ opener with full-width 】】 closer → null (closed)", () => {
  assert.equal(findWikilinkContext("[[abc】】", 7), null);
});

test("caret in the middle of the query still resolves", () => {
  // User typed `[[abc]]` then arrowed back to position 5
  // (between `c` and the first `]`). The dropdown should treat
  // this as editing the same link.
  const ctx = findWikilinkContext("[[abc]]", 5);
  assert.deepEqual(ctx, { start: 0, query: "abc", open: "[[", close: "]]" });
});

// ---------- applyWikilinkReplacement --------------------------------------

test("replacement preserves leading text typed before [[ (ASCII)", () => {
  // Core of the "不是替换内容" requirement: typing
  // "review " then `[[xyz` then picking "Foo.md" must yield
  // "review [[Foo]]", NOT "[[Foo]]" or just "Foo".
  const value = "review [[xyz";
  const caret = value.length;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next, caret: newCaret } = applyWikilinkReplacement(
    value,
    caret,
    ctx,
    "[[Foo]]",
  );
  assert.equal(next, "review [[Foo]]");
  assert.equal(newCaret, "review [[Foo]]".length);
});

test("replacement preserves leading text typed before 【【 (full-width)", () => {
  const value = "笔记 【【abc";
  const caret = value.length;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next } = applyWikilinkReplacement(value, caret, ctx, "[[Foo]]");
  // The leading `笔记 ` (with trailing space) is preserved, and
  // the picked link uses the canonical ASCII form.
  assert.equal(next, "笔记 [[Foo]]");
});

test("replacement drops a trailing `]]` the user has already typed", () => {
  // If the user typed `[[xyz]]` (closed already) and then picks,
  // we must NOT produce `[[Foo]]]` — drop the existing `]]`.
  // Caret sits at position 5: right after `xyz`, before `]]`.
  const value = "[[xyz]]";
  const caret = 5;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next } = applyWikilinkReplacement(value, caret, ctx, "[[Foo]]");
  assert.equal(next, "[[Foo]]");
});

test("replacement drops a trailing 】】 the user has already typed", () => {
  // Caret sits at position 5: right after `xyz`, before 】】.
  const value = "【【xyz】】";
  const caret = 5;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next } = applyWikilinkReplacement(value, caret, ctx, "[[Foo]]");
  assert.equal(next, "[[Foo]]");
});

test("replacement handles `]]` after the caret when opener is 【【", () => {
  // Edge case: user types `【【xyz]]` and picks. The `]]` after
  // the caret (mismatched family) should still be dropped.
  // Caret sits at position 5: right after `xyz`, before `]]`.
  const value = "【【xyz]]";
  const caret = 5;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next } = applyWikilinkReplacement(value, caret, ctx, "[[Foo]]");
  assert.equal(next, "[[Foo]]");
});

test("replacement with no trailing close produces a clean link", () => {
  const value = "[[xyz";
  const caret = 5;
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next, caret: newCaret } = applyWikilinkReplacement(
    value,
    caret,
    ctx,
    "[[Foo]]",
  );
  assert.equal(next, "[[Foo]]");
  assert.equal(newCaret, "[[Foo]]".length);
});

test("replacement preserves text AFTER the caret (caret is not at end)", () => {
  // User typed `[[xyz and then more`, caret sits after `xyz`
  // but the value has trailing text. That trailing text must
  // stay in place.
  const value = "[[xyz and then more";
  const caret = 5; // right after `xyz`
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next } = applyWikilinkReplacement(value, caret, ctx, "[[Foo]]");
  assert.equal(next, "[[Foo]] and then more");
});

test("replacement preserves BOTH leading AND trailing text", () => {
  // The full happy-path scenario: prefix + wikilink + suffix.
  const value = "todo: review [[xyz ASAP!";
  const caret = 18; // right after `xyz`
  const ctx = findWikilinkContext(value, caret);
  assert.ok(ctx);
  const { next } = applyWikilinkReplacement(value, caret, ctx, "[[Foo]]");
  assert.equal(next, "todo: review [[Foo]] ASAP!");
});
