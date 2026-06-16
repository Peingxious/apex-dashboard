// Sanity check for v1.4.10 banner serialization cleanup.
// Verifies:
//   1. Single-image banner serializes as a scalar
//      `banner: "url"` (no `image:` nested key).
//   2. Empty banner emits no `banner:` line at all (BUG-003b
//      regression check).
//   3. Round-trip: a file with the old object form
//      `banner:\n  image: "url"` still parses back correctly
//      (parser-side contract is unchanged).
//   4. Round-trip: a file with the new scalar form
//      `banner: "url"` parses back correctly.

import { parse, serialize } from "./_parser-loader.mjs";

const bannerUrl =
  "https://gd-hbimg.huaban.com/a46b63c441285134aed72ea725c1c21336af8d0713e53-lmNOvW";

function extractBanner(frontmatterStr) {
  // Tiny ad-hoc YAML scanner — we only need the first `banner:` line
  // for these tests, and the dashboard file's banner form is the
  // only thing under test.
  const m = frontmatterStr.match(/^banner:\s*(.*)$/m);
  return m ? m[1].trim() : null;
}

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    console.log("  PASS " + label);
    pass++;
  } else {
    console.log("  FAIL " + label);
    fail++;
  }
}

// Test 1: single-image banner serializes as scalar
{
  const md = serialize({
    banner: { quote: "", author: "", image: bannerUrl },
    quickActions: [],
    columns: [],
  });
  const bannerLine = extractBanner(md);
  console.log("\n=== Test 1: single-image banner scalar form ===");
  console.log(md);
  check("banner: appears exactly once on a single line", typeof bannerLine === "string");
  check("banner: contains the URL", bannerLine && bannerLine.includes(bannerUrl));
  check("no nested `image:` line follows", !/^\s+image:/m.test(md.split("banner:")[1] || ""));
}

// Test 2: empty banner emits no banner line (BUG-003b regression)
{
  const md = serialize({
    banner: { quote: "", author: "", image: "" },
    quickActions: [],
    columns: [],
  });
  console.log("\n=== Test 2: empty banner emits nothing ===");
  console.log(md);
  check("no banner: line", !/^banner:/m.test(md));
}

// Test 3: round-trip old object form
{
  const oldForm = `---\nbanner:\n  image: "${bannerUrl}"\ncolumns: []\n---\n`;
  const data = parse(oldForm);
  console.log("\n=== Test 3: round-trip from old object form ===");
  console.log(JSON.stringify(data.banner, null, 2));
  check("image is preserved", data.banner.image === bannerUrl);
}

// Test 4: round-trip new scalar form
{
  const newForm = `---\nbanner: "${bannerUrl}"\ncolumns: []\n---\n`;
  const data = parse(newForm);
  console.log("\n=== Test 4: round-trip from new scalar form ===");
  console.log(JSON.stringify(data.banner, null, 2));
  check("image is preserved", data.banner.image === bannerUrl);
}

// Test 5: serialize then re-parse (full round-trip)
{
  const original = {
    banner: { quote: "", author: "", image: bannerUrl },
    quickActions: [],
    columns: [],
  };
  const md = serialize(original);
  const reparsed = parse(md);
  console.log("\n=== Test 5: serialize→parse round-trip ===");
  check("banner.image survives round-trip", reparsed.banner.image === bannerUrl);
  check(
    "re-serialized form is identical (idempotent)",
    serialize(reparsed) === md,
  );
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
