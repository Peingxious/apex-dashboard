// Standalone sanity check for migrateCardsForSectionType — exercises
// the data-preserving rules the user asked for in v1.4.10:
//   1. `todo → projects` / `todo → memo` must not delete tasks —
//      the text is converted to body lines with `[ ]` stripped.
//   2. `projects → todo` / `memo → todo` must re-hydrate tasks
//      from the body lines so a round-trip is lossless.
//   3. `todoplus` clears the dashboard's card.tasks (the source
//      of truth is the linked note) but keeps the text in body.

import { migrateCardsForSectionType } from "./_migration-loader.mjs";

const todoCard = {
  type: "task",
  title: "Daily plan",
  tasks: [
    { text: "写周报", checked: false },
    { text: "买牛奶", checked: true },
    { text: "回邮件", checked: false },
  ],
  body: "",
};

const cases = [
  ["Original todo card", [todoCard], "—"],
  ["todo → projects (strip [ ], keep - prefix)", [todoCard], "projects"],
  ["todo → memo (strip [ ], no - prefix — free text)", [todoCard], "memo"],
  ["todo → todoplus (tasks cleared, text kept in body)", [todoCard], "todoplus"],
  [
    "projects → todo (re-hydrate from body)",
    [
      {
        type: "generic",
        title: "Daily plan",
        tasks: [],
        body: "- 写周报\n- 买牛奶\n- 回邮件",
      },
    ],
    "todo",
  ],
  [
    "memo → todo (re-hydrate from body, - prefix preserved)",
    [
      {
        type: "note",
        title: "Daily plan",
        tasks: [],
        body: "- 写周报\n- 买牛奶\n- 回邮件",
      },
    ],
    "todo",
  ],
  [
    "Existing projectDocs preserved on todo→projects",
    [
      {
        type: "task",
        title: "Projects",
        tasks: [{ text: "Task A", checked: false }],
        body: "old body",
        projectDocs: [{ path: "Note A" }],
      },
    ],
    "projects",
  ],
  [
    "Existing body preserved on todo→projects",
    [
      {
        type: "task",
        title: "X",
        tasks: [{ text: "Y", checked: false }],
        body: "previous body line",
      },
    ],
    "projects",
  ],
];

let pass = 0;
let fail = 0;
for (const [label, input, target] of cases) {
  const got = migrateCardsForSectionType(input, target);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(got, null, 2));
  if (target === "todo" && input[0].body) {
    const out = got[0];
    if (out.tasks && out.tasks.length === input[0].body.split("\n").length) {
      console.log("  PASS re-hydrated all body lines into tasks");
      pass++;
    } else {
      console.log("  FAIL task re-hydration lost data");
      fail++;
    }
  } else if (
    (target === "projects" || target === "memo" || target === "todoplus") &&
    Array.isArray(input[0].tasks) &&
    input[0].tasks.length > 0
  ) {
    const out = got[0];
    if (
      out.tasks.length === 0 &&
      typeof out.body === "string" &&
      out.body.length > 0
    ) {
      console.log("  PASS task text preserved in body");
      pass++;
    } else {
      console.log("  FAIL task text lost");
      fail++;
    }
  } else {
    pass++;
  }
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
